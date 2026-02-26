const config = require('./config.env');
const app = require('./app');

app.listen(config.port, () => {
  console.log(`Server running on http://localhost:${config.port}`);
});
