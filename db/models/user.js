const mongoose = require('mongoose')
const role = require('./enums/role')
const mongoosePaginate = require('mongoose-paginate-v2');

const roleEnum = [
    role.EMPLOYEE,
    role.ADMIN,
    role.MANAGER
]

const userSchema = new mongoose.Schema({
    firstName: {
        type: String,
        required: true,
    },
    lastName: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        lowercase: true
    },
    phoneNumber: {
        type: String,
        required: true,
    },
    role: {
        type: String,
        required: true,
        enum: roleEnum
    },
    facePhoto: {
        type: String
    },
    faceAIId: {
        type: Number
    },
    qrCode: {
        type: String,
        required: true,
    },
    login: {
        type: String,
        required: true,
    },
    password: {
        type: String,
        required: true,
    },
    work: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'tasks'
        }
      ],
    active: {
        type: Boolean,
        required: true,
        default: true
    }

})

userSchema.plugin(mongoosePaginate)
const User = mongoose.model('users', userSchema)

module.exports = User