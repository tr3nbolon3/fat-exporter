const { parse: parseCsv } = require('csv-parse/sync');
const { Telegraf, Markup } = require('telegraf');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { config } = require('./config');
const { gServiceAccountAuth } = require('./g-service-account-auth');
const { UserStateRepo } = require('./user-state-repo');

const USER_ACTION = {
  // GSA - Google Service Account
  // GTABLE - Google table
  ADD_GSA_EMAIL_TO_GTABLE: 'ADD_GSA_EMAIL_TO_GTABLE',
};

const ERROR = {
  DATE_NOT_FOUND: 'DATE_NOT_FOUND',
}

const log = (...args) => console.log(...args);

const extractDate = (fatReportUrl) => {
  const dateString = new RegExp('FoodDiary_(\\d{6})_meals').exec(fatReportUrl)[1];

  const year = dateString.slice(0, 2);
  const month = dateString.slice(2, 4);
  const day = dateString.slice(-2);

  return `${day}.${month}.20${year}`;
};

const fetchMacronutrients = async (fatReportUrl) => {
  const reportAsString = await fetch(fatReportUrl).then((response) => response.text());
  const csvAsString = reportAsString.split('\r\n').slice(7).filter(Boolean).join('\n');
  const csv = parseCsv(csvAsString);
  /**
   * Последняя строка с калориями и кбжу
   */
  const footer = csv.slice(-1)[0];

  const total = footer[1];
  const fat = footer[2];
  const proteins = footer[7];
  const carbohydrates = footer[4];

  return [total, fat, proteins, carbohydrates];
};

const updateSheet = async ({
  tableId,
  sheetName,
  fatReportDate,
  macronutrients,
}) => {
  const googleDoc = new GoogleSpreadsheet(tableId, gServiceAccountAuth);

  const [total, fat, proteins, carbohydrates] = macronutrients;

  await googleDoc.loadInfo();
  const sheet = googleDoc.sheetsByTitle[sheetName];
  const rows = await sheet.getRows();
  await sheet.loadCells();

  const searchedRow = rows.find((row) => {
    const dateCell = sheet.getCellByA1(`B${row.rowNumber}`);
    return dateCell.formattedValue === fatReportDate;
  });

  if (!searchedRow) {
    // error, result
    return [ERROR.DATE_NOT_FOUND, null];
  }

  const dCell = sheet.getCellByA1(`D${searchedRow.rowNumber}`);
  const fCell = sheet.getCellByA1(`F${searchedRow.rowNumber}`);
  const hCell = sheet.getCellByA1(`H${searchedRow.rowNumber}`);
  const jCell = sheet.getCellByA1(`J${searchedRow.rowNumber}`);

  dCell.value = Number(total.replace(',', '.'));
  fCell.value = Number(proteins.replace(',', '.'));
  hCell.value = Number(fat.replace(',', '.'));
  jCell.value = Number(carbohydrates.replace(',', '.'));

  await sheet.saveUpdatedCells();

  // error, result
  return [null, null];
};

const run = async () => {
  log('bot starting...');

  const userStateRepo = new UserStateRepo();
  await userStateRepo.load();

  const bot = new Telegraf(config.TG_BOT_TOKEN);
  bot.start(async (ctx) => {
    const userId = ctx.update.message.from.id;
    await userStateRepo.create(userId, { tableId: null, sheetName: null });

    await ctx.reply(
      `Привет! Для продолжения работы добавь в свою гугл таблицу пользователя ${config.G_SERVICE_ACCOUNT_EMAIL} с правами редактирования`,
      Markup.inlineKeyboard([
        Markup.button.callback('Добавил', USER_ACTION.ADD_GSA_EMAIL_TO_GTABLE),
      ]),
    );
  });

  bot.action(USER_ACTION.ADD_GSA_EMAIL_TO_GTABLE, async (ctx) => {
    await ctx.replyWithMarkdownV2('Отлично\\. Теперь введи ID google таблицы \\(находится в адресной строке между `/d/` и `/edit`, например 1qE\\-SjN7p3z\\-ojocJx0m1Xq\\-Y2rC8ArxUmDAMzKSXpqI\\)');
  });

  bot.on('message', async (ctx) => {
    try {
      const userId = ctx.message.from.id;
      const userState = userStateRepo.get(userId);

      console.dir({ userId });
      console.dir({ userState });

      if (!userState) {
        ctx.reply('Нажмите /start');
        return;
      }

      if (!userState.tableId) {
        const tableId = ctx.message.text;
        await userStateRepo.update(userId, { ...userState, tableId });
        await ctx.replyWithMarkdownV2(`ID google таблицы \`${tableId}\``);
        await ctx.reply(`Теперь отправь название листа с питанием, например Питание1 или Питание2`);
        return;
      }

      if (!userState.sheetName) {
        const sheetName = ctx.message.text;
        await userStateRepo.update(userId, { ...userState, sheetName });
        await ctx.replyWithMarkdownV2(`Название листа с питанием \`${sheetName}\``);
        await ctx.reply(`Теперь отправь отчет о питании (тип отчета "Сводка еды", формат "CSV")`);
        return;
      }

      const fatReportUrl = ctx.message.text;
      const isFatSecretReportUrl = fatReportUrl.startsWith('https://www.fatsecret.com/export');
      if (!isFatSecretReportUrl) {
        await ctx.reply('Некорректная ссылка на отчет о питании');
        return;
      }
      const isMealsCsvReport = fatReportUrl.includes('meals.csv');
      if (!isMealsCsvReport) {
        await ctx.reply('Пока бот поддерживает только отчет типа "Сводка еды" формата "CSV"');
        return;
      }

      await ctx.reply('Загружаем отчет о питании...');
      const fatReportDate = extractDate(fatReportUrl);
      const fatReportMacronutrients = await fetchMacronutrients(fatReportUrl);
      await ctx.reply('Обновляем гугл таблицу...');
      const [error] = await updateSheet({
        tableId: userState.tableId,
        sheetName: userState.sheetName,
        fatReportDate,
        macronutrients: fatReportMacronutrients,
      });
      if (error !== null) {
        if (error === ERROR.DATE_NOT_FOUND) {
          await ctx.reply(`Дата отчета "${fatReportDate}" не найдена в гугл таблице`);
          return;
        }
        throw new Error(error);
      }
      await ctx.reply('Обновление таблицы заверешено');
    } catch (error) {
      console.dir({ error });
      await ctx.reply(`Произошла ошибка`);
      await ctx.reply(`Проверь корректность введенных данных, ввести их заново можно через команду /start`);
      await ctx.reply(`Либо напиши разработчику @tr3nbolon3`);
    }
  });

  bot.startPolling();
  log('bot started');
};

run();
