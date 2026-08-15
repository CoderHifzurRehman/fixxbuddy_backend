const dns = require('dns');
// Set DNS servers first
dns.setServers(["1.1.1.1", "8.8.8.8"]);

require('dotenv').config();
const app = require('./src/app');


const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Trigger nodemon restart for new partner rating routes


