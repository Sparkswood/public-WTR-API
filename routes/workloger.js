const express = require('express')
const { ObjectID } = require('mongodb')
const router = express.Router()
const CommonResponse = require('../db/models/common-models/commonResponse')
const Query = require('../db/models/common-models/query')
const Pagination = require('../db/models/common-models/pagination')
const WorkLog = require('../db/models/workLog')
const worklogType = require('../db/models/enums/wroklogType')
const User = require('../db/models/user')
const Task = require('../db/models/task')


router.get('/', async (req, res) => {
    // req.session.currentUser.role
    const response = await getLogs(req.query, 'role')
    res.json(response)
})

const getLogs = async (reqQuery, loggedUserRole) => {
    try {
        let options = {
            collation: {locale: 'en'},
            customLabels: {
                totalDocs: 'totalResults',
                docs: 'items'
            },
            sort: {
                logDate: -1
            },
            populate: {
                path: 'idUser',
                select: 'firstName lastName'
            }
        }

        //PAGINATION
        if (reqQuery.pagination) {
            const pagination = new Pagination(JSON.parse(reqQuery.pagination))
            let page = pagination.currentPage
            let limit = pagination.itemsPerPage
            options = {page, limit, ...options}
        }

        //FILTERING AND TEXT SEARCH
        let finalQuery = []
        if (reqQuery.query) {
            const query = new Query(JSON.parse(reqQuery.query))

            //filters 
            if (query.filters) {
                let filtersList = query.filters

                for (let i = 0; i < filtersList.length; i++) {
                    // table of filter values
                    let filterValues = []
                    for (let j = 0; j < filtersList[i].values.length; j++) {
                        if (filtersList[i].name === 'logDate') {
                            filterValues.push({
                                [filtersList[i].name]: {$eq: new Date(filtersList[i].values[j])}
                            })
                        } else if(filtersList[i].name === 'idUser' || filtersList[i].name === 'idTask') {
                            filterValues.push({
                                [filtersList[i].name]: {$eq: ObjectID(filtersList[i].values[j])}
                            })
                        } else {
                            filterValues.push({
                                [filtersList[i].name]: {$eq: filtersList[i].values[j]}
                            })
                        }
                    }

                    // filter
                    if (filterValues.length > 0) {
                        finalQuery.push({
                            $or: filterValues
                        }) // every filter applied
                    }
                    
                }
            }
        }      

        let match = {}
        if (finalQuery.length > 0) match = {$and: finalQuery}
        
        let result = await WorkLog.paginate(match, options)

        let worklogs = []
        for (let i = 0; i < result.items.length; i++) {
            let worklog = {...result.items[i]._doc}
            worklog.user = `${worklog.idUser.firstName} ${worklog.idUser.lastName}`
            worklog.idUser = worklog.idUser !== null ? worklog.idUser._id : worklog.idUser
            worklogs = worklogs.concat(worklog)
        }

        result.items = worklogs
        let response = new CommonResponse({
            success: true,
            details: result
        })
        return response
        
    } catch(err) {
        let error = new CommonResponse({
            success: false,
            message: err._message ? err._message : err
        })
        return error
    }
}

router.post('/add', async (req, res) => {
    // req.session.currentUser.role
    const response = await logWork(req.body, 'role')
    res.json(response)
})

const logWork = async (body, loggedUserRole) => {
    try {
        let user = await User.findById({_id: ObjectID(body.idUser)})
        if (!user) throw 'User not found'
        let task = await Task.findById({_id: ObjectID(body.idTask)})
        if (!task) throw 'Task not found'
        let log = new WorkLog(body)
        let result = await checkLastLog(log)
        let response = new CommonResponse()
        if (result != false && !result.success) {
            log.logDate = new Date()
            await log.save()
            if (result.idTask) {
                let res = await WorkLog.findById({_id: ObjectID(result._id)}).populate('idTask', '_id stringId')
                let worklog = {...res._doc}
                worklog.task = worklog.idTask
                worklog.idTask =  worklog.idTask !== null ? worklog.idTask._id : task.idTask
                response.details = worklog
            }
            response.success = true
        } else if (result == false){
            response.success = false
            response.message = 'Operation not possible'
        } else response = result
        
        return response
        
    } catch(err) {
        let error = new CommonResponse({
            success: false,
            message: err._message ? err._message : err
        })
        return error
    }
}

const checkLastLog = async (log) => {
    try {
        let options = {
            collation: {locale: 'en'},
            customLabels: {
                totalDocs: 'totalResults',
                docs: 'items'
            },
            sort: {
                logDate: -1
            }
        }
        let res = await WorkLog.paginate({}, options)// podaj idtaska
        let latestLog = res.items[0]
        if (latestLog) {
            switch (latestLog.logType) {
                case worklogType.WORK:
                    if (log.logType != worklogType.WORK) return true
                    let closeLatLog = new WorkLog()
                        closeLatLog.idUser = latestLog.idUser
                        closeLatLog.idTask = latestLog.idTask
                        closeLatLog.logType = worklogType.AUTOBREAK
                        closeLatLog.logDate = new Date()
                    await closeLatLog.save()
                    return closeLatLog
                case worklogType.BREAK:
                    if (log.logType == worklogType.AUTOBREAK || log.logType == worklogType.BREAK) return false
                    return true
                case worklogType.AUTOBREAK:
                    if (log.logType == worklogType.BREAK || log.logType == worklogType.AUTOBREAK) return false
                    return true
                case worklogType.CLOSE:
                    if (latestLog.idTask === log.idTask) return false
                    else {
                        let lastTaskLog = res.filter(res => res.idTask === log.idTask)
                        if (!lastTaskLog[0] && log.logType == worklogType.WORK) return true
                        return await checkLastLog(lastTaskLog[0])
                    }
                default:
                    return false
            }
        } else {
            if (log.logType == worklogType.WORK) return true
            else return false
        }
    } catch(err) {
        let error = new CommonResponse({
            success: false,
            message: err._message ? err._message : err
        })
        return error
    }
}

module.exports = router