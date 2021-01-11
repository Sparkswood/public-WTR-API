const mongoose = require('mongoose')
const mongoosePaginate = require('mongoose-paginate-v2');

const projectSchema = new mongoose.Schema({
    stringId: {
        type: String,
        required: true,
        uppercase: true
    },
    createDate : {
        type: Date,
        required: true,
        default: Date.now(),
        immutable: true
    },
    dutyDate : {
        type: Date,
        required: true,
        default: Date.now() + 604800000 * 4
    },
    title : {
        type: String,
        required: true,
    },
    description : {
        type: String
    },
    idManager : {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users',
        required: true
    },
    active: {
        type: Boolean,
        required: true,
        default: true
    }
})

projectSchema.plugin(mongoosePaginate)
const Project = mongoose.model('projects', projectSchema)

module.exports = Project