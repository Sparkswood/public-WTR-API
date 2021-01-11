const mongoose = require('mongoose')

const paginationSchema = new mongoose.Schema({
    currentPage: {
        type: Number
    },
    itemsPerPage: {
        type: Number
    }
},{ _id : false })

const Pagination = mongoose.model('pagination', paginationSchema)

module.exports = Pagination