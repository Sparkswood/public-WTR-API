const mongoose = require('mongoose')

const responseSchema = new mongoose.Schema({
    success: {
        type: Boolean,
        required: true
    },
    message: {
        type: String
    },
    details: {
        type: mongoose.Schema.Types.Mixed
    }
},{ _id : false })

const CommonResponse = mongoose.model('commonResponse', responseSchema)

module.exports = CommonResponse
