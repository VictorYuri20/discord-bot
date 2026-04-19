const { 
  Client, 
  GatewayIntentBits, 
  Partials, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} = require('discord.js');
const fs = require('fs');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

client.once('ready', () => {
  console.log(`Bot online como ${client.user.tag}`);
});

// ---------------- CONFIG POR SERVIDOR ----------------
let configs = {};
const configFile = './config.json';

if (fs.existsSync(configFile)) {
  configs = JSON.parse(fs.readFileSync(configFile, 'utf8'));
}

function salvarConfigs() {
  fs.writeFileSync(configFile, JSON.stringify(configs, null, 2));
}

// ---------------- SISTEMA DE TICKETS ----------------
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const guildId = message.guild?.id;
  if (!guildId) return;

  // Configurar cargos (aceita múltiplos IDs)
  if (message.content.startsWith('!setcargo')) {
    const cargos = message.content.split(' ').slice(1);
    if (cargos.length === 0) return message.reply("⚠️ Use: !setcargo <ID do cargo> [ID do cargo2] ...");
    if (!configs[guildId]) configs[guildId] = {};
    configs[guildId].adminRoles = cargos;
    salvarConfigs();
    return message.reply(`✅ Cargos de admin configurados: ${cargos.map(id => `<@&${id}>`).join(', ')}`);
  }

  // Configurar canal fixo
  if (message.content.startsWith('!setcanal')) {
    const canalId = message.content.split(' ')[1];
    if (!canalId) return message.reply("⚠️ Use: !setcanal <ID do canal>");
    if (!configs[guildId]) configs[guildId] = {};
    configs[guildId].fixedChannel = canalId;
    salvarConfigs();
    return message.reply(`✅ Canal fixo configurado para <#${canalId}>`);
  }

  // Configurar mensagem
  if (message.content.startsWith('!setmensagem')) {
    const texto = message.content.replace('!setmensagem ', '');
    if (!texto) return message.reply("⚠️ Use: !setmensagem <texto>");
    if (!configs[guildId]) configs[guildId] = {};
    configs[guildId].ticketMessage = texto;
    salvarConfigs();
    return message.reply(`✅ Mensagem de ticket configurada: ${texto}`);
  }

  // Reenviar embed fixo
  if (message.content === '!reenviar') {
    const canalId = configs[guildId]?.fixedChannel;
    if (!canalId) return message.reply("⚠️ Configure primeiro com !setcanal <ID>");

    const canal = await client.channels.fetch(canalId);

    const embed = new EmbedBuilder()
      .setTitle('📢 Aviso aos membros do servidor')
      .setDescription(configs[guildId]?.ticketMessage || "Mensagem padrão de ticket")
      .setColor(0x5865F2);

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder().setCustomId('reportar').setLabel('📌 Reportar Infrações').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('suporte').setLabel('📞 Suporte da Equipe').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('informacoes').setLabel('❓ Informações & Colaborações').setStyle(ButtonStyle.Secondary)
      );

    await canal.send({ embeds: [embed], components: [row] });
  }
});

// ---------------- INTERAÇÕES ----------------
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const guildId = interaction.guild?.id;
  if (!guildId) return;

  const adminRoles = configs[guildId]?.adminRoles || [];
  if (adminRoles.length === 0) {
    return interaction.reply({ content: "⚠️ Configure primeiro com !setcargo <IDs>", ephemeral: true });
  }

  if (['reportar', 'suporte', 'informacoes'].includes(interaction.customId)) {
    const canalTicket = await interaction.guild.channels.create({
      name: `ticket-${interaction.user.username}`,
      type: 0,
      permissionOverwrites: [
        { id: interaction.guild.roles.everyone.id, deny: ['ViewChannel'] },
        { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages'] },
        ...adminRoles.map(id => ({ id, allow: ['ViewChannel', 'SendMessages'] }))
      ]
    });

    const nomes = {
      reportar: "📌 Reportar Infrações",
      suporte: "📞 Suporte da Equipe",
      informacoes: "❓ Informações & Colaborações"
    };

    const mensagemInicial = new EmbedBuilder()
      .setTitle('📢 Ticket Aberto')
      .setDescription(
        `Olá ${interaction.user}, obrigado por abrir um ticket.\n\n` +
        `➡️ Você clicou no botão **${nomes[interaction.customId]}**.\n` +
        `🔔 ${adminRoles.map(id => `<@&${id}>`).join(', ')} foram notificados.`
      )
      .setColor(0xED4245);

    const rowFechar = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder().setCustomId('fechar').setLabel('🔒 Fechar Ticket').setStyle(ButtonStyle.Secondary)
      );

    await canalTicket.send({ embeds: [mensagemInicial], components: [rowFechar] });
    await interaction.reply({ content: `Ticket criado: ${canalTicket}`, ephemeral: true });
  }

  if (interaction.customId === 'fechar') {
    await interaction.channel.delete();
  }
});

// ---------------- JOGO TERMO ----------------
const palavras = JSON.parse(fs.readFileSync('./data/palavras.json', 'utf8'));
const palavras5 = palavras.filter(p => p.length === 5);
let palavraSecreta = palavras5[Math.floor(Math.random() * palavras5.length)];
const tentativas = {};

// Função para remover acentos
function removerAcentos(str) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function verificarTentativa(tentativa, palavra) {
  tentativa = removerAcentos(tentativa.toUpperCase());
  palavra = removerAcentos(palavra.toUpperCase());

  const resultado = Array(tentativa.length).fill("⬛");

  const freq = {};
  for (let letra of palavra) {
    freq[letra] = (freq[letra] || 0) + 1;
  }

  // Verdes
  for (let i = 0; i < tentativa.length; i++) {
    if (tentativa[i] === palavra[i]) {
      resultado[i] = "🟩";
      freq[tentativa[i]]--;
    }
  }

  // Amarelos
  for (let i = 0; i < tentativa.length; i++) {
    if (resultado[i] === "⬛" && freq[tentativa[i]] > 0) {
      resultado[i] = "🟨";
      freq[tentativa[i]]--;
    }
  }

  const linhaEmojis = resultado.join(" ");
  const linhaLetras = tentativa.split("").join("   ");

  return `\`\`\`\n${linhaEmojis}\n${linhaLetras}\n\`\`\``;
}

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith('!termo')) {
    let tentativa = message.content.split(' ')[1];
    if (!tentativa) return message.reply("Digite uma palavra depois de !termo");

    tentativa = removerAcentos(tentativa);

    if (tentativa.length !== 5) {
      return message.reply("⚠️ A palavra deve ter exatamente 5 letras (sem acento)!");
    }

    const userId = message.author.id;
    if (!tentativas[userId]) {
      tentativas[userId] = { palavra: palavraSecreta, chances: 6 };
    }

    if (tentativas[userId].chances <= 0) {
      return message.reply("❌ Você já usou todas as suas tentativas!");
    }

    const resultado = verificarTentativa(tentativa, tentativas[userId].palavra);
    tentativas[userId].chances--;

    await message.reply(`${resultado}\nTentativas restantes: ${tentativas[userId].chances}`);

    if (tentativa.toUpperCase() === removerAcentos(tentativas[userId].palavra.toUpperCase())) {
      await message.channel.send(`🎉 Parabéns ${message.author}, você acertou!`);
      palavraSecreta = palavras5[Math.floor(Math.random() * palavras5.length)];
      tentativas[userId] = { palavra: palavraSecreta, chances: 6 };
      await message.channel.send("🔄 Nova rodada iniciada!");
    } else if (tentativas[userId].chances === 0) {
      await message.channel.send(`❌ ${message.author}, acabou! A palavra era **${tentativas[userId].palavra}**.`);
      palavraSecreta = palavras5[Math.floor(Math.random() * palavras5.length)];
      tentativas[userId] = { palavra: palavraSecreta, chances: 6 };
      await message.channel.send("🔄 Nova rodada iniciada!");
    }
   }
});

// ---------------- LOGIN ----------------
client.login(process.env.TOKEN);

