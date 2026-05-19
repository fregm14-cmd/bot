const { Client, GatewayIntentBits, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Events, Partials, PermissionFlagsBits, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
require('dotenv').config();

const token = process.env.DISCORD_TOKEN;
const guildId = process.env.GUILD_ID;

if (!token || !guildId) {
  console.error('Lütfen .env dosyanıza DISCORD_TOKEN ve GUILD_ID ekleyin.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

const TICKET_CATEGORY_NAME = '🎫 Ticketler';
const STAFF_ROLE_NAME = 'Support';

// Rol ID'leri .env'den alın
const TICKET_TYPES = {
  'moderator': {
    label: 'Moderatör Bileti',
    roleId: process.env.MODERATOR_ROLE_ID || '',
    emoji: '👮'
  },
  'general': {
    label: 'General Bileti',
    roleId: process.env.GENERAL_ROLE_ID || '',
    emoji: '📝'
  },
  'admin': {
    label: 'Yönetim Bileti',
    roleId: process.env.ADMIN_ROLE_ID || '',
    emoji: '👑'
  }
};

function buildTicketPanel() {
  const embed = new EmbedBuilder()

    .setDescription('# Destek Sistemi\n\nAşağıdan ticket türünü seçerek destek için başvurabilirsiniz. Her bir ticket türü farklı ekip tarafından yanıtlanır, doğru seçimi yaparak daha hızlı destek alabilirsiniz. Lütfen sorununuzu kısa ve net bir şekilde açıklayın. Gerektiğinde yetkililer sizden ek bilgi isteyebilir.\n\n**Destek Menümüz:**')
    .addFields(
      { name: '👮 Moderatör Bileti', value: 'Moderasyon ile ilgili sorunlar için', inline: false },
      { name: '📝 General Bileti', value: 'Genel sorular ve bilgiler için', inline: false },
      { name: '👑 Yönetim Bileti', value: 'Önemli yönetim konuları için', inline: false }
    )
    .setColor(0x2F3136)
    .setImage('https://i.pinimg.com/736x/c1/91/aa/c191aa07c26dfcd08d74984b77ef08a9.jpg')
    .setFooter({ text: 'Destek Sistemi | Osmanlı Tevhid Ordusu' })
    .setTimestamp();

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('ticket-type-select')
    .setPlaceholder('Ticket türünü seçin...')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(TICKET_TYPES.moderator.label)
        .setValue('moderator')
        .setEmoji(TICKET_TYPES.moderator.emoji)
        .setDescription('Moderatör ekibi tarafından hızlı yanıt alın'),
      new StringSelectMenuOptionBuilder()
        .setLabel(TICKET_TYPES.general.label)
        .setValue('general')
        .setEmoji(TICKET_TYPES.general.emoji)
        .setDescription('Genel sorularınız için destek'),
      new StringSelectMenuOptionBuilder()
        .setLabel(TICKET_TYPES.admin.label)
        .setValue('admin')
        .setEmoji(TICKET_TYPES.admin.emoji)
        .setDescription('Yönetim ekibine ulaşın')
    );

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu)] };
}

function buildCloseButton() {
  const button = new ButtonBuilder()
    .setCustomId('ticket-close')
    .setLabel('🔒 Ticket Kapat')
    .setStyle(ButtonStyle.Danger);

  return { components: [new ActionRowBuilder().addComponents(button)] };
}

async function ensureTicketCategory(guild) {
  const existing = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === TICKET_CATEGORY_NAME.toLowerCase()
  );

  if (existing) return existing;

  return guild.channels.create({
    name: TICKET_CATEGORY_NAME,
    type: ChannelType.GuildCategory,
    permissionOverwrites: []
  });
}

async function createTicketChannel(interaction, ticketType, isDeferred = false) {
  const guild = interaction.guild;
  if (!guild) return;

  const ticketConfig = TICKET_TYPES[ticketType];
  if (!ticketConfig) {
    const method = isDeferred ? 'followUp' : 'reply';
    await interaction[method]({ content: 'Bilinmeyen ticket türü.', flags: ['Ephemeral'] });
    return;
  }

  const existingTicket = guild.channels.cache.find(
    (c) => c.name === `ticket-${ticketType}-${interaction.user.id}` && c.type === ChannelType.GuildText
  );

  if (existingTicket) {
    const method = isDeferred ? 'followUp' : 'reply';
    await interaction[method]({ content: `Bu türde zaten açık bir ticketin var: ${existingTicket}`, flags: ['Ephemeral'] });
    return;
  }

  const category = await ensureTicketCategory(guild);

  const permissionOverwrites = [
    {
      id: guild.roles.everyone,
      deny: [PermissionsBitField.Flags.ViewChannel]
    },
    {
      id: interaction.user.id,
      allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
    }
  ];

  // Rol ekleme - her rol ID'sini virgülle ayrılmış olarak işle
  if (ticketConfig.roleId && ticketConfig.roleId !== 'SendinRolIdBuraya') {
    const roleIdList = ticketConfig.roleId.split(',').map(id => id.trim());
    roleIdList.forEach(roleId => {
      permissionOverwrites.push({
        id: roleId,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
      });
    });
  }

  const channel = await guild.channels.create({
    name: `ticket-${ticketType}-${interaction.user.username}`,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites,
    topic: `${ticketConfig.label} - ${interaction.user.tag}`
  });

  // Setup embed
  const setupEmbed = new EmbedBuilder()
    .setTitle(`${ticketConfig.emoji} Ticket Açıldı`)
    .setDescription(`${interaction.user} tarafından başarıyla açıldı.`)
    .addFields(
      { name: 'Ticket Türü', value: ticketConfig.label, inline: true },
      { name: 'Başvuru Saati', value: `<t:${Math.floor(Date.now() / 1000)}:f>`, inline: true },
      { name: '\u200b', value: '\u200b', inline: false },
      { name: 'Bilgilendirme', value: 'Yetkililer en kısa sürede size yardımcı olacaktır. Lütfen sabırlı olun.', inline: false }
    )
    .setColor(0x2F3136)
    .setFooter({ text: 'Ticket Sistemi' })
    .setTimestamp();

  let roleTag = '';
  if (ticketConfig.roleId && ticketConfig.roleId !== 'SendinRolIdBuraya') {
    const roleIdList = ticketConfig.roleId.split(',').map(id => id.trim());
    roleTag = roleIdList.map(roleId => `<@&${roleId}>`).join(' ');
  }

  await channel.send({
    content: roleTag || '**Yetkili ekip, lütfen bu ticketi kontrol edin.**',
    embeds: [setupEmbed],
    ...buildCloseButton()
  });

  const successEmbed = new EmbedBuilder()
    .setTitle('✅ Ticket Başarıyla Oluşturuldu')
    .setDescription(`${channel} kanalına hoşgeldiniz!`)
    .setColor(0x43B581)
    .setFooter({ text: 'Ticket sistemi' });

  const method = isDeferred ? 'followUp' : 'reply';
  await interaction[method]({ embeds: [successEmbed], flags: ['Ephemeral'] });
}

async function closeTicketChannel(interaction) {
  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: 'Bu komut sadece ticket kanallarında çalışır.', flags: ['Ephemeral'] });
    return;
  }

  if (!channel.name.startsWith('ticket-')) {
    await interaction.reply({ content: 'Bu kanal bir ticket kanalı değil.', flags: ['Ephemeral'] });
    return;
  }

  // Rol kontrolü - virgülle ayrılmış rol ID'lerini parse et
  const roleIds = [
    ...(process.env.MODERATOR_ROLE_ID?.split(',') || []),
    ...(process.env.GENERAL_ROLE_ID?.split(',') || []),
    ...(process.env.ADMIN_ROLE_ID?.split(',') || [])
  ].map(id => id.trim()).filter(id => id && id !== 'SendinRolIdBuraya');

  const hasPermission = interaction.member.roles.cache.some(role => roleIds.includes(role.id)) ||
                        interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);

  if (!hasPermission) {
    const deniedEmbed = new EmbedBuilder()
      .setTitle('❌ Yetkiniz Yok')
      .setDescription('Ticket kapatma yetkisine sahip değilsiniz.')
      .setColor(0xFF0000)
      .setFooter({ text: 'Ticket sistemi' });
    
    await interaction.reply({ embeds: [deniedEmbed], flags: ['Ephemeral'] });
    return;
  }

  const closingEmbed = new EmbedBuilder()
    .setTitle('🔒 Ticket Kapatılıyor')
    .setDescription('Bu ticket 5 saniye içinde kapatılacaktır.')
    .setColor(0xFF0000)
    .setFooter({ text: 'Ticket sistemi' });

  await interaction.reply({ embeds: [closingEmbed], flags: ['Ephemeral'] });
  
  setTimeout(async () => {
    try {
      await channel.delete('Ticket kapatıldı');
    } catch (err) {
      console.error('Ticket kapatılırken hata oluştu:', err);
    }
  }, 5000);
}

client.once(Events.ClientReady, async () => {
  console.log(`${client.user.tag} giriş yaptı.`);

  const guild = await client.guilds.fetch(guildId);
  const commands = guild.commands;

  await commands.create({
    name: 'ticket-setup',
    description: 'Ticket açma panelini gönderir.'
  });

  await commands.create({
    name: 'ticket-close',
    description: 'Ticket kanalını kapatır.'
  });

  console.log('Slash komutları kayıt edildi.');
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'ticket-setup') {
      // Komut yetkisi kontrolü
      const commandAdminRoleId = process.env.COMMAND_ADMIN_ROLE_ID;
      const hasCommandPermission = commandAdminRoleId && commandAdminRoleId !== 'KomutYetkiRolIdBuraya' &&
                                  interaction.member.roles.cache.has(commandAdminRoleId);
      
      if (!hasCommandPermission && !interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: 'Bu komutu kullanmak için gerekli yetkiye sahip değilsiniz.', flags: ['Ephemeral'] });
        return;
      }
      await interaction.showModal(
        new ModalBuilder()
          .setCustomId('ticket-setup-modal')
          .setTitle('Ticket Paneli Kurulum')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('channel-id-input')
                .setLabel('Kanal ID\'sini girin')
                .setPlaceholder('1234567890')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            )
          )
      );
    }

    if (interaction.commandName === 'ticket-close') {
      await closeTicketChannel(interaction);
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'ticket-setup-modal') {
      const channelId = interaction.fields.getTextInputValue('channel-id-input');
      
      try {
        const targetChannel = await interaction.guild.channels.fetch(channelId);
        if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
          await interaction.reply({ content: 'Geçersiz kanal ID\'si. Lütfen yazı kanalının ID\'sini girin.', flags: ['Ephemeral'] });
          return;
        }

        await targetChannel.send(buildTicketPanel());
        
        const setupEmbed = new EmbedBuilder()
          .setTitle('✅ Ticket Paneli Kuruldu')
          .setDescription(`Ticket paneli ${targetChannel} kanalına başarıyla gönderildi.`)
          .setColor(0x43B581)
          .setFooter({ text: 'Ticket Sistemi' });
        
        await interaction.reply({ embeds: [setupEmbed], flags: ['Ephemeral'] });
      } catch (err) {
        await interaction.reply({ content: 'Kanal bulunamadı. Lütfen doğru kanal ID\'sini girin.', flags: ['Ephemeral'] });
        console.error('Hata:', err);
      }
    }
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'ticket-type-select') {
      const ticketType = interaction.values[0];
      await interaction.deferReply({ flags: ['Ephemeral'] });
      await createTicketChannel(interaction, ticketType, true);
    }
  }

  if (interaction.isButton()) {
    if (interaction.customId === 'ticket-close') {
      await closeTicketChannel(interaction);
    }
  }
});

client.login(token);
