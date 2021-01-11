const mongoose = require('mongoose')
require('dotenv').config()

// DATABASE CONNECTION
const CONNECTION_URI = process.env.MONGODB_URI
mongoose.connect(CONNECTION_URI, {
    useNewUrlParser: true,
    useCreateIndex: true,
    useUnifiedTopology: true,
    useFindAndModify: false
})