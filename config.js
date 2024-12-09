require('dotenv').config();

const config = {
  G_SERVICE_ACCOUNT_EMAIL: process.env.G_SERVICE_ACCOUNT_EMAIL,
  G_SERVICE_ACCOUNT_PRIVATE_KEY: process.env.G_SERVICE_ACCOUNT_PRIVATE_KEY,
  TG_BOT_TOKEN: process.env.TG_BOT_TOKEN,
};

module.exports = { config };
