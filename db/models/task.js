const mongoose = require('mongoose')
const mongoosePaginate = require('mongoose-paginate-v2');
const progress = require('./enums/progress')
const priority = require('./enums/priority');

const progressEnum = [
    progress.NEW,
    progress.IN_PROGRESS,
    progress.FINISHED
]
const priorityEnum = [
    priority.LOW,
    priority.MEDIUM,
    priority.HIGH
]

const taskSchema = new mongoose.Schema({
    stringId: {
        type: String,
        required: true,
        uppercase: true
    },
    title: {
        type: String,
        required: true,
    },
    description: {
        type: String,
        required: true,
    },
    status: {
        type: String,
        required: true,
        default: 'new',
        enum: progressEnum
    },
    priority: {
        type: String,
        required: true,
        default: 'low',
        enum: priorityEnum
    },
    createDate : {
        type: Date,
        required: true,
        default: Date.now(),
        immutable: true
    },
    dutyDate : {
        type: Date,
        required: true
    },
    idProject: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'projects',
        required: true
    },
    idReporter: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users',
        required: true
    },
    workers: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'users'
        }
      ],
    active: {
        type: Boolean,
        required: true,
        default: true
    }

})

taskSchema.plugin(mongoosePaginate)
const Task = mongoose.model('tasks', taskSchema)

module.exports = Task