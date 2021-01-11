const mongoose = require('mongoose')

const credentialsSchema = new mongoose.Schema({
    login: {
        type: String
    },
    password: {
        type: String
    }
},{ _id : false })

const Credentials = mongoose.model('credentials', credentialsSchema)

module.exports = Credentials
