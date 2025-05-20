
require('dotenv').config();
const connectDB=require('./config/db');
const express = require('express');
const cors = require("cors"); //for cors remove
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const routes = require('./routes/index');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();

// CORS configuration to allow only localhost with any port
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || /^http:\/\/localhost:\d+$/.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true, // only if you're using cookies or authorization headers
};

app.use(cors(corsOptions));


app.use(express.json());
// Enable CORS for all routes
app.use(cors());

const logStream = fs.createWriteStream(path.join(__dirname, 'requests.log'), { flags: 'a' });

// Middleware to log requests with timestamps to a file
morgan.token('time', () => new Date().toISOString());
app.use(morgan(':method :url :status :res[content-length] - :response-time ms - :time', { stream: logStream }));
// app.use(morgan(':method :url :status :res[content-length] - :response-time ms - :time'));



// Rate limiting middleware
const limiter = rateLimit({
    windowMs: 1 * 30 * 1000, // 1 minute
    max: process.env.RATE_LIMIT || 5, // limit each IP to 5 requests per windowMs
    message: { error: 'Too many requests, please try again later.' },
    // statusCode: 429,
});



app.use(limiter);

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.text());
 
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) =>{    
    res.status(200).json({
        message: "Helloo Code working fine...........",
        url: `${req.protocol}://${req.get("host")}`,
      });
})

// Routes
app.use('/api', routes);
connectDB();



module.exports = app;
