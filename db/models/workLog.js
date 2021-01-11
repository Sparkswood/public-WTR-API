const mongoose = require('mongoose')
const worklogType = require('./enums/wroklogType')
const mongoosePaginate = require('mongoose-paginate-v2');

const logEnum = [
    worklogType.WORK,
    worklogType.BREAK,
    worklogType.AUTOBREAK,
    worklogType.CLOSE
]

const workLogSchema = new mongoose.Schema({
    idTask: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'tasks',
        required: true,
    },
    idUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users',
        required: true,
    },
    logDate: {
        type: Date,
        required: true,
        default: Date.now()
    },
    logType: {
        type: String,
        required: true,
        enum: logEnum
    }
})

workLogSchema.plugin(mongoosePaginate)
const WorkLog = mongoose.model('workLog', workLogSchema)

module.exports = WorkLog