const { Telegraf, Markup } = require('telegraf');
const RuangOTP = require('./ruangotp');
const Database = require('./database');
require('dotenv').config();

// Konfigurasi
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const RUANGOTP_USER_ID = process.env.RUANGOTP_USER_ID || 'YOUR_RUANGOTP_USER_ID';
const ADMIN_ID = process.env.ADMIN_ID || 'YOUR_TELEGRAM_ID';
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || ''; // Channel ID untuk log (contoh: -1001234567890)

// Inisialisasi
const bot = new Telegraf(BOT_TOKEN);
const api = new RuangOTP();
const db = new Database();

// State management untuk user yang sedang proses order
const userStates = new Map();

// ==================== PAGINATION UTILS ====================
const ITEMS_PER_PAGE = 10;

const paginateButtons = (items, page) => {
    const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
    const start = page * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const pageItems = items.slice(start, end);
    return { pageItems, totalPages };
};


// ==================== SENSOR UTILS ====================
const sensorText = (text, visibleStart = 2, visibleEnd = 2) => {
    if (!text || text.length <= visibleStart + visibleEnd) return text;
    const start = text.slice(0, visibleStart);
    const end = text.slice(-visibleEnd);
    const masked = '*'.repeat(text.length - visibleStart - visibleEnd);
    return start + masked + end;
};

const sensorPhone = (phone) => {
    if (!phone || phone.length < 5) return phone;
    return phone.slice(0, 3) + '****' + phone.slice(-2);
};

const sendLog = async (message) => {
    if (!LOG_CHANNEL_ID) return;
    try {
        await bot.telegram.sendMessage(LOG_CHANNEL_ID, message, { parse_mode: 'HTML' });
    } catch (e) {
        console.log('Gagal kirim log:', e.message);
    }
};

// ==================== FORMAT UTILS ====================
const formatRupiah = (number) => {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(number);
};

function formatDate(date = new Date()) {
    try {
        if (!date) return '-';

        const d = new Date(date);

        if (isNaN(d.getTime())) {
            return '-';
        }

        return new Intl.DateTimeFormat(
            'id-ID',
            {
                timeZone: 'Asia/Jakarta',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            }
        ).format(d);

    } catch (err) {
        console.log('FormatDate Error:', err);
        return '-';
    }
}

// ==================== KEYBOARD LAYOUTS ====================
const mainKeyboard = () => {
    return Markup.inlineKeyboard([
        [Markup.button.callback('📱 ORDER OTP', 'menu_order')],
        [
            Markup.button.callback('💰 CEK SALDO', 'menu_saldo'),
            Markup.button.callback('📋 ORDER AKTIF', 'menu_active')
        ],
        [
            Markup.button.callback('💳 DEPOSIT ', 'menu_deposit'),
            Markup.button.callback('📢 JOIN CHANNEL', 'menu_channel')
        ],
        [
            Markup.button.callback('👤 CONTACT CS', 'menu_cs'),
            Markup.button.callback('📜 RIWAYAT ORDER', 'menu_history')
        ]
    ]);
};

const backKeyboard = (callback = 'menu_start') => {
    return Markup.inlineKeyboard([
        [Markup.button.callback('« Kembali ke Menu', callback)]
    ]);
};

// ==================== START COMMAND ====================
bot.start(async (ctx) => {
    const user = ctx.from;
    const telegramId = user.id.toString();
    await db.createUser(telegramId, user.username, user.first_name, user.last_name);
    const userData = await db.getUser(telegramId);

    const welcomeText = `🔴 <b>Threesa Nokos</b>

` +
        `━━━━━━━━━━━━━━━━━━━━

` +
        `🆔 <b>ID:</b> <code>${telegramId}</code>
` +
        `👤 <b>Username:</b> ${user.username ? '@' + user.username : 'N/A'}
` +
        `💰 <b>Saldo:</b> ${formatRupiah(userData.saldo)}
` +
        `🕐 <b>Uptime:</b> ${formatDate(new Date())}

` +
        `━━━━━━━━━━━━━━━━━━━━

` +
        `Halo ${user.first_name || 'User'}! Silakan pilih menu:`;

    await ctx.replyWithHTML(welcomeText, mainKeyboard());
});

// ==================== ADMIN COMMAND ====================
bot.command('addsaldo', async (ctx) => {
    const telegramId = ctx.from.id.toString();
    if (telegramId !== ADMIN_ID) {
        return ctx.reply('❌ Akses ditolak!');
    }
    const args = ctx.message.text.split(' ');
    if (args.length < 3) {
        return ctx.reply('Format salah!\n\nContoh:\n/addsaldo 123456789 50000');
    }
    const targetId = args[1];
    const nominal = parseInt(args[2]);
    if (isNaN(nominal) || nominal <= 0) {
        return ctx.reply('❌ Nominal tidak valid!');
    }
    const user = await db.getUser(targetId);
    if (!user) {
        return ctx.reply('❌ User tidak ditemukan!');
    }
    await db.updateSaldo(targetId, nominal);
    const updatedUser = await db.getUser(targetId);
    await ctx.replyWithHTML(
        `✅ <b>BERHASIL TAMBAH SALDO</b>\n\n👤 ID User: <code>${targetId}</code>\n💰 Nominal: ${formatRupiah(nominal)}\n💵 Saldo Sekarang: ${formatRupiah(updatedUser.saldo)}`
    );
    try {
        await bot.telegram.sendMessage(
            targetId,
            `💰 <b>SALDO BERTAMBAH</b>\n\n➕ Nominal: ${formatRupiah(nominal)}\n💵 Saldo Sekarang: ${formatRupiah(updatedUser.saldo)}`,
            { parse_mode: 'HTML' }
        );
    } catch (e) {
        console.log('Gagal kirim not:', e.message);
    }
});

// ==================== TEST LOG CHANNEL ====================
bot.command('testlog', async (ctx) => {

    try {

        console.log('LOG_CHANNEL_ID:', LOG_CHANNEL_ID);

        const result = await bot.telegram.sendMessage(
            LOG_CHANNEL_ID,
            'TEST LOG'
        );

        console.log(result);

        await ctx.reply('✅ Berhasil');

    } catch (err) {

        console.log('ERROR FULL:', err);

        await ctx.reply(
            err.response?.description ||
            err.message ||
            'Unknown error'
        );

    }

});

// ==================== MAIN MENU ====================
bot.action('menu_start', async (ctx) => {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id.toString();

    let userData = await db.getUser(telegramId);

    if (!userData) {
        await db.createUser(
            telegramId,
            ctx.from.username,
            ctx.from.first_name,
            ctx.from.last_name
        );

        userData = await db.getUser(telegramId);
    }

    const saldo = userData ? userData.saldo : 0;

    const text = `🔴 <b>Threesaa Nokos</b>

━━━━━━━━━━━━━━━━━━━━

🆔 <b>ID:</b> <code>${telegramId}</code>
👤 <b>Username:</b> ${ctx.from.username ? '@' + ctx.from.username : 'N/A'}
💰 <b>Saldo:</b> ${formatRupiah(saldo)}

━━━━━━━━━━━━━━━━━━━━

Halo ${ctx.from.first_name || 'User'}! Silakan pilih menu:`;

    await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...mainKeyboard()
    });
});

// ==================== CEK SALDO ====================
bot.action('menu_saldo', async (ctx) => {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id.toString();
    const userData = await db.getUser(telegramId);
    const saldo = userData ? userData.saldo : 0;
    const text = `💰 <b>INFORMASI SALDO</b>

👤 <b>User:</b> ${ctx.from.first_name || 'User'}
🆔 <b>ID:</b> <code>${telegramId}</code>
💵 <b>Saldo Saat Ini:</b> ${formatRupiah(saldo)}

💡 <i>Untuk menambah saldo, gunakan menu DEPOSIT.</i>`;
    await ctx.editMessageText(text, { parse_mode: 'HTML', ...backKeyboard() });
});

// ==================== ORDER OTP ====================
bot.action('menu_order', async (ctx) => {
    await ctx.answerCbQuery('Memuat layanan...');
    const telegramId = ctx.from.id.toString();
    const userData = await db.getUser(telegramId);
    if (!userData || userData.saldo <= 0) {
        await ctx.editMessageText(
            `❌ <b>SALDO TIDAK CUKUP!</b>\n\nSaldo Anda: ${formatRupiah(userData ? userData.saldo : 0)}\n\nSilakan deposit terlebih dahulu.`,
            { parse_mode: 'HTML', ...backKeyboard() }
        );
        return;
    }
    const services = await api.getServices(RUANGOTP_USER_ID);
    if (!services.success || !services.data || services.data.length === 0) {
        await ctx.editMessageText(
            `❌ <b>Gagal memuat layanan!</b>\n\nError: ${services.message || 'Tidak ada layanan tersedia'}`,
            { parse_mode: 'HTML', ...backKeyboard() }
        );
        return;
    }
    userStates.set(telegramId + "_services", services.data);
    await showServicesPage(ctx, 0);
});

const showServicesPage = async (ctx, page) => {
    const services = userStates.get(ctx.from.id.toString() + "_services") || [];
    const telegramId = ctx.from.id.toString();
    const userData = await db.getUser(telegramId);
    const items = services.map(service => ({
        label: service.service_name + (service.category ? " (" + service.category + ")" : ""),
        callback: `service_${service.service_code}_${service.service_name}`
    }));
    const { pageItems, totalPages } = paginateButtons(items, page);
    const buttons = pageItems.map(item => [
        Markup.button.callback(item.label, item.callback)
    ]);
    const navButtons = [];
    if (page > 0) {
        navButtons.push(Markup.button.callback('⬅️ Prev', `svc_page_${page - 1}`));
    }
    navButtons.push(Markup.button.callback(`📄 ${page + 1}/${totalPages}`, 'noop'));
    if (page < totalPages - 1) {
        navButtons.push(Markup.button.callback('Next ➡️', `svc_page_${page + 1}`));
    }
    if (navButtons.length > 0) buttons.push(navButtons);
    buttons.push([Markup.button.callback('« Kembali', 'menu_start')]);
    const text = `📱 <b>PILIH LAYANAN OTP</b>\n\n💰 <b>Saldo:</b> ${formatRupiah(userData.saldo)}\n📋 <b>Total:</b> ${services.length} layanan | Halaman ${page + 1}/${totalPages}\n\nSilakan pilih layanan:`;
    try {
        if (ctx.callbackQuery) {
            try {
        await ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
    } catch (e) {
        if (e.description && e.description.includes('message is not modified')) {
            await ctx.answerCbQuery();
        } else {
            throw e;
        }
    }
        } else {
            await ctx.replyWithHTML(text, Markup.inlineKeyboard(buttons));
        }
    } catch (e) {
        if (e.description && e.description.includes('message is not modified')) {
            await ctx.answerCbQuery();
        } else {
            throw e;
        }
    }
};

bot.action(/svc_page_(\d+)/, async (ctx) => {
    await ctx.answerCbQuery();
    const page = parseInt(ctx.match[1]);
    await showServicesPage(ctx, page);
});

bot.action('noop', async (ctx) => {
    await ctx.answerCbQuery();
});

// ==================== SERVICE SELECTION -> COUNTRIES ====================
bot.action(/service_(\d+)_(.+)/, async (ctx) => {
    await ctx.answerCbQuery();
    const serviceId = ctx.match[1];
    const serviceName = ctx.match[2];
    const telegramId = ctx.from.id.toString();
    userStates.set(telegramId, {
        step: 'select_country',
        serviceId: serviceId,
        serviceName: serviceName
    });
    const countries = await api.getCountries(RUANGOTP_USER_ID, serviceId);
    if (!countries.success || !countries.data || countries.data.length === 0) {
        await ctx.editMessageText(
            `❌ <b>Gagal memuat negara!</b>\n\nError: ${countries.message || 'Tidak ada negara tersedia'}`,
            { parse_mode: 'HTML', ...backKeyboard('menu_order') }
        );
        userStates.delete(telegramId);
        return;
    }
    userStates.set(telegramId + "_countries", countries.data);
    userStates.set(telegramId + "_serviceName", serviceName);
    userStates.set(telegramId + "_serviceId", serviceId);
    await showCountriesPage(ctx, 0);
});

const showCountriesPage = async (ctx, page) => {
    const countries = userStates.get(ctx.from.id.toString() + "_countries") || [];
    const serviceName = userStates.get(ctx.from.id.toString() + "_serviceName") || 'Layanan';

    // Tampilkan negara saja (tanpa provider)
    const items = countries.map(country => ({
        label: country.name + ' (+' + country.prefix + ') - ' + (country.stock_total || 0) + ' stok',
        callback: `countrysel|${country.number_id}|${country.name}`
    }));

    const { pageItems, totalPages } = paginateButtons(items, page);
    const buttons = pageItems.map(item => [
        Markup.button.callback(item.label, item.callback)
    ]);
    const navButtons = [];
    if (page > 0) {
        navButtons.push(Markup.button.callback('⬅️ Prev', `cnt_page_${page - 1}`));
    }
    navButtons.push(Markup.button.callback(`📄 ${page + 1}/${totalPages}`, 'noop'));
    if (page < totalPages - 1) {
        navButtons.push(Markup.button.callback('Next ➡️', `cnt_page_${page + 1}`));
    }
    if (navButtons.length > 0) buttons.push(navButtons);
    buttons.push([Markup.button.callback('« Kembali', 'menu_order')]);
    const text = `🌍 <b>PILIH NEGARA</b>\n\n📱 <b>Layanan:</b> ${serviceName}\n📋 <b>Total:</b> ${countries.length} negara | Halaman ${page + 1}/${totalPages}\n\nSilakan pilih negara:`;
    try {
        await ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
    } catch (e) {
        if (e.description && e.description.includes('message is not modified')) {
            await ctx.answerCbQuery();
        } else {
            throw e;
        }
    }
};

bot.action(/cnt_page_(\d+)/, async (ctx) => {
    await ctx.answerCbQuery();
    const page = parseInt(ctx.match[1]);
    await showCountriesPage(ctx, page);
});

// ==================== COUNTRY SELECTION -> SHOW PROVIDERS ====================
bot.action(/countrysel\|([^\|]+)\|([^\|]+)/, async (ctx) => {
    await ctx.answerCbQuery();
    const numberId = ctx.match[1];
    const countryName = ctx.match[2];
    const telegramId = ctx.from.id.toString();
    const state = userStates.get(telegramId);
    if (!state) return;

    state.step = 'select_provider';
    state.numberId = numberId;
    state.countryName = countryName;

    // Cari pricelist negara ini
    const countries = userStates.get(telegramId + "_countries") || [];
    const country = countries.find(c => c.number_id.toString() === numberId);

    if (!country || !country.pricelist || country.pricelist.length === 0) {
        await ctx.editMessageText(
            `❌ <b>Tidak ada provider tersedia!</b>\n\nNegara: ${countryName}`,
            { parse_mode: 'HTML', ...backKeyboard('cnt_page_0') }
        );
        return;
    }

    // Simpan provider items untuk pagination
    const providerItems = country.pricelist.map(pl => ({
        label: `${pl.price_format} | Stok: ${pl.stock} | Svr:${pl.server_id} | Rate:${pl.rate}`,
        callback: `prov|${numberId}|${countryName}|${pl.provider_id}|${pl.price}`
    }));

    userStates.set(telegramId + "_providerItems", providerItems);
    userStates.set(telegramId + "_providerCountry", countryName);
    userStates.set(telegramId + "_providerNumberId", numberId);

    await showProvidersPage(ctx, 0);
});

const showProvidersPage = async (ctx, page) => {
    const telegramId = ctx.from.id.toString();
    const providerItems = userStates.get(telegramId + "_providerItems") || [];
    const countryName = userStates.get(telegramId + "_providerCountry") || '';
    const state = userStates.get(telegramId);

    const { pageItems, totalPages } = paginateButtons(providerItems, page);

    const buttons = pageItems.map(item => [
        Markup.button.callback(item.label, item.callback)
    ]);

    // Pagination nav
    const navButtons = [];
    if (page > 0) {
        navButtons.push(Markup.button.callback('⬅️ Prev', `prv_page_${page - 1}`));
    }
    navButtons.push(Markup.button.callback(`📄 ${page + 1}/${totalPages}`, 'noop'));
    if (page < totalPages - 1) {
        navButtons.push(Markup.button.callback('Next ➡️', `prv_page_${page + 1}`));
    }
    if (navButtons.length > 0) buttons.push(navButtons);

    buttons.push([Markup.button.callback('« Kembali', `cnt_page_0`)]);

    const text = `🏪 <b>PILIH PROVIDER</b>\n\n📱 <b>Layanan:</b> ${state?.serviceName || ''}\n🌍 <b>Negara:</b> ${countryName}\n📋 <b>Provider:</b> ${providerItems.length} pilihan | Halaman ${page + 1}/${totalPages}\n\nSilakan pilih provider:`;

    try {
        await ctx.editMessageText(
    text,
    {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard(buttons)
    }
);
    } catch (e) {
        if (e.description && e.description.includes('message is not modified')) {
            await ctx.answerCbQuery();
        } else {
            throw e;
        }
    }
};

// Handle pagination providers
bot.action(/prv_page_(\d+)/, async (ctx) => {
    await ctx.answerCbQuery();
    const page = parseInt(ctx.match[1]);
    await showProvidersPage(ctx, page);
});

// ==================== PROVIDER SELECTION -> OPERATORS ====================
bot.action(/prov\|([^\|]+)\|([^\|]+)\|([^\|]+)\|([^\|]+)/, async (ctx) => {
    await ctx.answerCbQuery();
    const numberId = ctx.match[1];
    const countryName = ctx.match[2];
    const providerId = ctx.match[3];
    const price = parseInt(ctx.match[4]) || 0;
    const telegramId = ctx.from.id.toString();
    const state = userStates.get(telegramId);
    if (!state) return;
    state.step = 'select_operator';
    state.numberId = numberId;
    state.countryName = countryName;
    state.providerId = providerId;
    state.price = price;
    const operators = await api.getOperators(RUANGOTP_USER_ID, countryName, providerId);
    const operatorButtons = [];
    if (operators.success && operators.data && operators.data.length > 0) {
        operators.data.forEach(op => {
            operatorButtons.push([
                Markup.button.callback(op.name.toUpperCase(), `operator_${op.id}_${op.name}`)
            ]);
        });
    }
    operatorButtons.push([Markup.button.callback('🎲 RANDOM OPERATOR', `operator_any_any`)]);
    operatorButtons.push([Markup.button.callback('« Kembali', `countrysel|${numberId}|${countryName}`)]);
    const text = `📡 <b>PILIH OPERATOR</b>\n\n📱 <b>Layanan:</b> ${state.serviceName}\n🌍 <b>Negara:</b> ${countryName}\n💰 <b>Harga:</b> ${formatRupiah(price)}\n\nPilih operator atau random:`;
    await ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(operatorButtons) });
});

// ==================== OPERATOR SELECTION -> ORDER ====================

bot.action(/operator_(.+)_(.+)/, async (ctx) => {

    await ctx.answerCbQuery('Memproses order...');

    const operatorId = ctx.match[1];
    const operatorName = ctx.match[2];

    const telegramId = ctx.from.id.toString();
    const state = userStates.get(telegramId);

    if (!state) return;

    // ================= CEK SALDO =================

    const userData = await db.getUser(telegramId);

    if (!userData || userData.saldo < state.price) {

        await ctx.editMessageText(
`❌ <b>SALDO TIDAK MENCUKUPI</b>

💰 Saldo Anda:
${formatRupiah(userData ? userData.saldo : 0)}

💸 Harga Nomor:
${formatRupiah(state.price)}

Silakan deposit terlebih dahulu.`,
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            '💳 DEPOSIT',
                            'menu_deposit'
                        )
                    ],
                    [
                        Markup.button.callback(
                            '🏠 MENU UTAMA',
                            'menu_start'
                        )
                    ]
                ])
            }
        );

        return;
    }

    // ================= LANJUT ORDER =================

    state.step = 'ordered';
    state.operatorId = operatorId;

    console.log('ORDER PARAMS:', {
        numberId: state.numberId,
        providerId: state.providerId,
        operatorId: operatorId === 'any' ? 'any' : operatorId,
        expectedPrice: state.price
    });

    const order = await api.orderNumber(
        RUANGOTP_USER_ID,
        state.numberId,
        state.providerId,
        operatorId === 'any' ? 'any' : operatorId,
        state.price > 0 ? state.price : null
    );

    console.log('ORDER RESPONSE:', order);

    if (!order.success || !order.data) {

        await ctx.editMessageText(
            `❌ <b>ORDER GAGAL!</b>\n\nError: ${order.message || 'Gagal memesan nomor'}\n\nSilakan coba lagi atau hubungi CS.`,
          {
    parse_mode: 'HTML',
    ...backKeyboard('menu_order')
}
        );

        userStates.delete(telegramId);
        return;
    }

    const orderData = order.data;
    await db.createOrder(telegramId, orderData.order_id, state.serviceName, state.countryName, orderData.phone_number, orderData.price);
    await db.updateSaldo(telegramId, -orderData.price);

    // Log ke channel
    const userLog = await db.getUser(telegramId);
    const logText = `🛒 <b>ORDER BARU</b>\n\n` +
        `👤 <b>User:</b> ${sensorText(ctx.from.first_name || 'N/A', 2, 1)}\n` +
        `🆔 <b>ID:</b> <code>${sensorText(telegramId, 3, 2)}</code>\n` +
        `📱 <b>Layanan:</b> ${state.serviceName}\n` +
        `🌍 <b>Negara:</b> ${state.countryName}\n` +
        `📞 <b>Nomor:</b> <code>${sensorPhone(orderData.phone_number)}</code>\n` +
        `💰 <b>Harga:</b> ${formatRupiah(orderData.price)}\n` +
        `🕐 <b>Waktu:</b> ${formatDate(new Date())}`;
    await sendLog(logText);

    await ctx.editMessageText(
        `✅ <b>ORDER BERHASIL!</b>\n\n🆔 <b>Order ID:</b> <code>${orderData.order_id}</code>\n📱 <b>Nomor:</b> <code>${orderData.phone_number}</code>\n💰 <b>Harga:</b> ${formatRupiah(orderData.price)}\n💵 <b>Sisa Saldo:</b> ${formatRupiah(orderData.remaining_balance)}\n\n⏳ <b>Status:</b> Menunggu SMS...\n\n📋 <i>Order akan otomatis masuk ke daftar order aktif.</i>\nGunakan tombol di bawah untuk cek status:`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔄 CEK STATUS', `check_${orderData.order_id}`)],
                [Markup.button.callback('❌ CANCEL ORDER', `cancel_${orderData.order_id}`)],
                [Markup.button.callback('« Menu Utama', 'menu_start')]
            ])
        }
    );
    userStates.delete(telegramId);
});

// ==================== CEK STATUS SMS ====================
bot.action(/check_(.+)/, async (ctx) => {
    await ctx.answerCbQuery('Mengecek status...');
    const orderId = ctx.match[1];
    const telegramId = ctx.from.id.toString();
    const status = await api.checkStatus(RUANGOTP_USER_ID, orderId);
    if (!status.success) {
        await ctx.reply(
            `❌ <b>Gagal cek status!</b>\n\nError: ${status.message}`,
            { parse_mode: 'HTML', ...backKeyboard() }
        );
        return;
    }
    const data = status.data;
    let statusText = '';
    let statusEmoji = '';
    if (data.status === 'ACTIVE') {
        statusEmoji = '⏳';
        statusText = 'Menunggu SMS';
    } else if (data.status === 'COMPLETED') {
        statusEmoji = '✅';
        statusText = 'OTP Diterima';
        await db.updateOrderStatus(orderId, 'COMPLETED', data.otp_code);
    } else {
        statusEmoji = '❌';
        statusText = data.status;
    }
    let message = `${statusEmoji} <b>STATUS ORDER</b>\n\n🆔 <b>Order ID:</b> <code>${orderId}</code>\n📊 <b>Status:</b> ${statusText}`;
    if (data.otp_code) {
        message += `\n\n🔢 <b>KODE OTP:</b> <code>${data.otp_code}</code>`;
    }
    message += `\n\n<i>Auto-check setiap 30 detik...</i>`;
    await ctx.reply(message, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🔄 Refresh', `check_${orderId}`)],
            [Markup.button.callback('« Kembali', 'menu_active')]
        ])
    });
});

// ==================== CANCEL ORDER ====================
bot.action(/cancel_(.+)/, async (ctx) => {
    await ctx.answerCbQuery('Membatalkan order...');
    const orderId = ctx.match[1];
    const telegramId = ctx.from.id.toString();
    const cancel = await api.cancelOrder(RUANGOTP_USER_ID, orderId);
    if (!cancel.success) {
        await ctx.reply(
            `❌ <b>Gagal cancel!</b>\n\nError: ${cancel.message || 'Tidak dapat membatalkan order'}`,
            { parse_mode: 'HTML', ...backKeyboard() }
        );
        return;
    }
    const data = cancel.data;
    await db.updateOrderStatus(orderId, 'CANCELLED');
    if (data.refund_amount) {
        await db.updateSaldo(telegramId, data.refund_amount);
    }
    await ctx.reply(
        `✅ <b>ORDER DIBATALKAN!</b>\n\n🆔 <b>Order ID:</b> <code>${data.order_id}</code>\n💰 <b>Refund:</b> ${formatRupiah(data.refund_amount || 0)}\n💵 <b>Saldo Sekarang:</b> ${formatRupiah(data.current_balance || 0)}\n\nSaldo telah dikembalikan.`,
        { parse_mode: 'HTML', ...backKeyboard('menu_active') }
    );
});

// ==================== ORDER AKTIF ====================
bot.action('menu_active', async (ctx) => {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id.toString();
    const activeOrders = await db.getActiveOrders(telegramId);
    if (activeOrders.length === 0) {
        await ctx.editMessageText(
            `📋 <b>ORDER AKTIF</b>\n\nTidak ada order aktif saat ini.\n\nGunakan menu ORDER OTP untuk memesan.`,
            { parse_mode: 'HTML', ...backKeyboard() }
        );
        return;
    }
    let text = `📋 <b>ORDER AKTIF (${activeOrders.length})</b>\n\n`;
    const buttons = [];
    activeOrders.forEach((order, index) => {
        text += `${index + 1}. <code>${order.order_id}</code>\n   📱 ${order.phone_number || 'N/A'}\n   📊 ${order.status} | ${order.service_name}\n\n`;
        buttons.push([
            Markup.button.callback(`🔄 ${order.order_id}`, `check_${order.order_id}`),
            Markup.button.callback(`❌ Cancel`, `cancel_${order.order_id}`)
        ]);
    });
    buttons.push([Markup.button.callback('« Menu Utama', 'menu_start')]);
    try {
        await ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
    } catch (e) {
        if (e.description && e.description.includes('message is not modified')) {
            await ctx.answerCbQuery();
        } else {
            throw e;
        }
    }
});

// ==================== RIWAYAT ORDER ====================
bot.action('menu_history', async (ctx) => {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id.toString();
    const history = await db.getOrderHistory(telegramId, 10);
    if (history.length === 0) {
        await ctx.editMessageText(
            `📜 <b>RIWAYAT ORDER</b>\n\nBelum ada riwayat order.`,
            { parse_mode: 'HTML', ...backKeyboard() }
        );
        return;
    }
    let text = `📜 <b>RIWAYAT ORDER (10 Terakhir)</b>\n\n`;
    history.forEach((order, index) => {
        const statusEmoji = order.status === 'COMPLETED' ? '✅' : order.status === 'CANCELLED' ? '❌' : '⏳';
        text += `${index + 1}. ${statusEmoji} <code>${order.order_id}</code>\n   📱 ${order.phone_number || 'N/A'}\n   💰 ${formatRupiah(order.price)} | ${order.status}\n   🕐 ${formatDate(order.created_at)}\n\n`;
    });
    await ctx.editMessageText(text, { parse_mode: 'HTML', ...backKeyboard() });
});

// ==================== DEPOSIT ====================
bot.action('menu_deposit', async (ctx) => {
    await ctx.answerCbQuery();

    await ctx.editMessageText(
`💳 <b>DEPOSIT SALDO</b>

Silakan kirim nominal deposit.

Contoh:
1000
5000
10000

Minimal deposit Rp1.000`,
        {
            parse_mode: 'HTML',
            ...backKeyboard()
        }
    );

    userStates.set(ctx.from.id.toString(), {
        step: 'deposit_input',
        depositMessageId: ctx.callbackQuery.message.message_id
    });
});

//====================DEPOSIT 2====================
bot.on('text', async (ctx, next) => {

    const telegramId = ctx.from.id.toString();

    const rejectState =
        userStates.get(
            'reject_' + ctx.from.id
        );

    if (
        rejectState &&
        rejectState.step === 'reject_reason'
    ) {

        // DISINI HARUS HANDLE ALASAN PENOLAKAN

        await bot.telegram.sendMessage(
            rejectState.telegramId,
            `❌ Deposit ditolak.

📝 Alasan:
${ctx.message.text}`
        );

        userStates.delete(
            'reject_' + ctx.from.id
        );

        return ctx.reply(
            '✅ Alasan terkirim.'
        );

    }

    const state =
        userStates.get(
            telegramId
        );

    if (
        !state ||
        state.step !== 'deposit_input'
    ) {
        return next();
    }

    const nominal = parseInt(
        ctx.message.text.replace(/[^\d]/g, '')
    );

    if (
        isNaN(nominal) ||
        nominal < 1000 ||
        nominal > 150000
    ) {
        return ctx.reply(
            '❌ Nominal deposit harus antara Rp1.000 - Rp150.000'
        );
    }

    const kodeUnik =
        Math.floor(
            Math.random() * 201
        ) + 100;

    const transfer =
        nominal + kodeUnik;

    let user =
        await db.getUser(
            telegramId
        );

    if (!user) {

        await db.createUser(
            telegramId,
            ctx.from.username,
            ctx.from.first_name,
            ctx.from.last_name
        );

    }

    userStates.set(
        telegramId + '_deposit',
        {
            nominal,
            kodeUnik,
            transfer
        }
    );

    await db.createDeposit(
        telegramId,
        nominal,
        'manual'
    );

    try {
        await ctx.deleteMessage();
    } catch (e) {}

    await ctx.telegram.editMessageText(
        ctx.chat.id,
        state.depositMessageId,
        null,
`💳 <b>KONFIRMASI DEPOSIT</b>

💰 Deposit: ${formatRupiah(nominal)}
🏷 Biaya Admin: ${kodeUnik}
💸 Transfer: ${formatRupiah(transfer)}

📊 Status: PENDING

🏦 <b>PEMBAYARAN TRANSFER</b>

🏛 Bank : DANA
👤 Atas Nama : monnajjaa
💳 Norek : 083116640027

💬 Admin :
@anaktuyul12
@anaktuyul13

⚠ Yang masuk saldo tetap ${formatRupiah(nominal)}

Transfer sesuai nominal agar mudah dicek.`,
        {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: '📸 KIRIM BUKTI TF',
                            callback_data: 'upload_bukti'
                        }
                    ],
                    [
                        {
                            text: '🏠 KEMBALI KE MENU',
                            callback_data: 'menu_start'
                        }
                    ]
                ]
            }
        }
    );

});

// ==================== UPLOAD BUKTI ====================

bot.action('upload_bukti', async (ctx) => {

    await ctx.answerCbQuery();

    const depositData =
        userStates.get(
            ctx.from.id.toString() + '_deposit'
        );

    userStates.set(
        ctx.from.id.toString(),
        {
            step: 'waiting_proof',
            nominal: depositData
                ? depositData.nominal
                : 0
        }
    );

    await ctx.reply(
        '📸 Silakan kirim foto bukti transfer sekarang.'
    );

});

// ==================== KONFIRMASI DEPOSIT ====================

bot.action(
    /^confirm_(.+)_(.+)$/,
    async (ctx) => {

        await ctx.answerCbQuery(
            'Deposit dikonfirmasi'
        );

        const telegramId =
            ctx.match[1];

        const nominal =
            parseInt(ctx.match[2]);
        
           const depositData =
    userStates.get(
        telegramId + '_deposit'
    );

const kodeUnik =
    depositData?.kodeUnik || 0;

        await db.updateSaldo(
    telegramId,
    nominal
);

const user = await db.getUser(telegramId);

await sendLog(
`💰 DEPOSIT BERHASIL

👤 User :
******

🆔 User ID :
${telegramId}

💰 Nominal :
${formatRupiah(nominal)}

🏷️ Pajak :
${formatRupiah(kodeUnik)}
`
);
        await bot.telegram.sendMessage(
            telegramId,
`✅ DEPOSIT BERHASIL

💰 Saldo Masuk:
${formatRupiah(nominal)}`,
            {
                parse_mode: 'HTML'
            }
        );

        await ctx.editMessageCaption(
            '✅ DEPOSIT DIKONFIRMASI'
        );

    }
);

bot.action(
 /^rejectmenu_(.+)$/,
 async (ctx) => {

  const telegramId =
  ctx.match[1];

  await ctx.editMessageReplyMarkup({
   inline_keyboard: [
    [
     {
      text:
      '❌ Tanpa Alasan',
      callback_data:
      `reject_${telegramId}`
     }
    ],
    [
     {
      text:
      '📝 Dengan Alasan',
      callback_data:
      `rejectreason_${telegramId}`
     }
    ]
   ]
  });

 });

bot.action(
 /^rejectreason_(.+)$/,
 async (ctx) => {

  userStates.set(
   'reject_' + ctx.from.id,
   {
    step:
    'reject_reason',

    telegramId:
    ctx.match[1]
   }
  );

  await ctx.reply(
   'Kirim alasan penolakan.'
  );

 });


// ==================== PHOTO HANDLER ====================

bot.on('photo', async (ctx) => {

    try {

        const telegramId =
            ctx.from.id.toString();

        const state =
            userStates.get(
                telegramId
            );
        
        const rejectState =
userStates.get(
'reject_' + ctx.from.id
);

if (
rejectState &&
rejectState.step ===
'reject_reason'
){

await bot.telegram.sendMessage(
rejectState.telegramId,
`❌ Deposit ditolak.

📝 Alasan:
${ctx.message.text}`
);

userStates.delete(
'reject_' + ctx.from.id
);

return ctx.reply(
'✅ Alasan terkirim.'
);
}

        if (
            !state ||
            state.step !==
                'waiting_proof'
        ) {
            return;
        }

        const photo =
            ctx.message.photo[
                ctx.message.photo.length - 1
            ];

        const photoId =
            photo.file_id;

        const nominal =
            state.nominal || 0;

        await bot.telegram.sendPhoto(
            ADMIN_ID,
            photoId,
            {
                caption:
`💳 DEPOSIT BARU

👤 User :
******

🆔 User ID :
${telegramId}

💰 Nominal :
${formatRupiah(nominal)}

🏷️ Biaya Admin :
${formatRupiah(kodeUnik)}

💸 Total Transfer :
${formatRupiah(nominal + kodeUnik)}

🕐 Waktu :
${new Date().toLocaleString(
'id-ID',
{
 timeZone:'Asia/Jakarta'
}
)} WIB

Silakan konfirmasi deposit.`,
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: '✅ KONFIRMASI',
                                callback_data:
                                    `confirm_${telegramId}_${nominal}`
                            },
                            {
                                text: '❌ TOLAK',
                                callback_data:
                              `rejectmenu_${telegramId}`
                            }
                        ]
                    ]
                }
            }
        );

        userStates.delete(
            telegramId
        );

        await ctx.reply(
`✅ Bukti transfer berhasil dikirim.

Silakan tunggu admin melakukan pengecekan.`
        );

    } catch (err) {

        console.log(err);

        await ctx.reply(
            `❌ Error: ${err.message}`
        );

    }

});
       

// ==================== JOIN CHANNEL ====================
bot.action('menu_channel', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
        `📢 <b>JOIN CHANNEL</b>\n\nGabung channel kami untuk info update & promo!\n\n🔗 <b>Link:</b>@threesaotp\n\n✅ Dapatkan info terbaru seputar layanan kami.`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.url('📢 JOIN CHANNEL', 'https://t.me/threesaotp')],
                [Markup.button.callback('« Kembali', 'menu_start')]
            ])
        }
    );
});

// ==================== CONTACT CS ====================
bot.action('menu_cs', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.editMessageText(
        `👤 <b>CONTACT CUSTOMER SERVICE</b>\n\nButuh bantuan? Hubungi CS kami!\n\n📞 <b>Telegram:</b> @anaktuyul12\n⏰ <b>Jam Operasional:</b> 24 Jam\n\n💡 <i>Silakan sertakan ID user Anda saat menghubungi CS.</i>`,
        {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.url('💬 CHAT CS', 'https://t.me/anaktuyul12')],
                [Markup.button.callback('« Kembali', 'menu_start')]
            ])
        }
    );
});

// ==================== ERROR HANDLING ====================
bot.catch((err, ctx) => {
    console.error('Bot error:', err);
    ctx.reply(
        `❌ <b>Terjadi Kesalahan!</b>\n\nError: ${err.message || 'Unknown error'}\n\nSilakan coba lagi atau hubungi CS.`,
        { parse_mode: 'HTML', ...mainKeyboard() }
    );
});

  
// ==================== AUTO CHECK ACTIVE ORDERS ====================
setInterval(async () => {
    try {
        const dbAll = require('sqlite3').verbose();
        const tempDb = new dbAll.Database('./nokosbot.db');
        tempDb.all(
            `SELECT * FROM orders WHERE status = 'ACTIVE'`,
            [],
            async (err, rows) => {
                if (err || !rows || rows.length === 0) return;
                for (const order of rows) {
                    try {
                        const status = await api.checkStatus(RUANGOTP_USER_ID, order.order_id);
                        if (status.success && status.data && status.data.status === 'COMPLETED') {
                            await db.updateOrderStatus(order.order_id, 'COMPLETED', status.data.otp_code);
                            bot.telegram.sendMessage(
                                order.telegram_id,
                                `✅ <b>OTP DITERIMA!</b>\n\n🆔 <b>Order:</b> <code>${order.order_id}</code>\n📱 <b>Nomor:</b> <code>${order.phone_number}</code>\n🔢 <b>Kode OTP:</b> <code>${status.data.otp_code}</code>\n\nGunakan kode OTP di atas untuk verifikasi.`,
                                { parse_mode: 'HTML' }
                            );

                            // Log OTP ke channel
                            const otpLogText = `🔢 <b>OTP MASUK</b>\n\n` +
                                `👤 <b>User:</b> ${sensorText(order.telegram_id, 3, 2)}\n` +
                                `📱 <b>Layanan:</b> ${order.service_name}\n` +
                                `🌍 <b>Negara:</b> ${order.country}\n` +
                                `📞 <b>Nomor:</b> <code>${sensorPhone(order.phone_number)}</code>\n` +
                                `🔐 <b>OTP:</b> <code>${sensorText(status.data.otp_code, 1, 1)}</code>\n` +
                                `🕐 <b>Waktu:</b> ${formatDate(new Date())}`;
                            await sendLog(otpLogText);
                        }
                    } catch (e) {
                        console.error('Auto-check error:', e);
                    }
                }
            }
        );
        tempDb.close();
    } catch (error) {
        console.error('Auto-check interval error:', error);
    }
}, 30000);

// ==================== START BOT ====================
console.log('🤖 Bot Nokos OTP RuangOTP Starting...');
console.log('📡 API Base: https://api.ruangotp.site/api/v1');
console.log('💾 Database: SQLite3 (nokosbot.db)');
console.log('⏰ Auto-check: 30 detik');

bot.launch()
    .then(() => {
        console.log('✅ Bot berjalan!');
    })
    .catch((err) => {
        console.error('❌ Gagal start bot:', err);
        process.exit(1);
    });

process.once('SIGINT', () => {
    bot.stop('SIGINT');
    db.close();
});
process.once('SIGTERM', () => {
    bot.stop('SIGTERM');
    db.close();
});
