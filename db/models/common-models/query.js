const mongoose = require('mongoose')

const querySchema = new mongoose.Schema({
    searchString: {
        type: String
    },
    filters: [{
        name: {
            type: String
        },
        values: [String]
    }]
},{ _id : false })

const Query = mongoose.model('query', querySchema)

module.exports = Query