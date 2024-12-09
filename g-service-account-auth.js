const { JWT } = require('google-auth-library');
const { config } = require('./config');

const gServiceAccountAuth = new JWT({
  email: config.G_SERVICE_ACCOUNT_EMAIL,
  key: config.G_SERVICE_ACCOUNT_PRIVATE_KEY,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

module.exports = { gServiceAccountAuth };
