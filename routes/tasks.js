const express = require('express')
const { ObjectID } = require('mongodb')
const Project = require('../db/models/project')
const router = express.Router()
const Task = require('../db/models/task')
const User = require('../db/models/user')
const Query = require('../db/models/common-models/query')
const Pagination = require('../db/models/common-models/pagination')
const CommonResponse = require('../db/models/common-models/commonResponse')
const WorkLog = require('../db/models/workLog')
const worklogType = require('../db/models/enums/wroklogType')
const jwt = require('jsonwebtoken');
const role = require('../db/models/enums/role')

// GENERATE STRING ID
const generateStringId = async (title) => {
    try {
        const words = title.split(' ')
        let acronym = ''
        for (let i = 0; i < words.length; i++) {
            acronym = acronym.concat(words[i].charAt(0))
        }
        const searchString = `task_${acronym}_`
        let stringTasks = await Task.find(
            {
                stringId: { $regex: searchString, $options: 'i' }
            }
        )
        const stringId = searchString + (stringTasks.length + 1)

        return stringId
    } catch(err) {
        let error = new CommonResponse({
            success: false,
            message: err._message ? err._message : err
        })
        return error
    }
}

// GET ALL TASKS
router.get('/', async (req, res) => {
    const token = req.header('auth-token');
    const verified = jwt.verify(token, process.env.TOKEN_SECRET);

    const response = await getTasks(req.query, verified)
    res.json(response)
})

const getTasks = async (reqQuery, verifiedUser) => {

    try {
        let options = {
            collation: {locale: 'en'},
            customLabels: {
                totalDocs: 'totalResults',
                docs: 'items'
            },
            sort: {
                dutyDate: 1,
                priority: 1
            },
            populate: {
                path: 'idProject',
                select: '_id stringId'
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

            let searchStringQuery = {}

            //text search
            if (query.searchString) { 
                let searchString = query.searchString
                searchStringQuery = {
                    $or: [
                        {
                            stringId: {$regex: searchString, $options: 'i'}
                        },
                        {
                            title: {$regex: searchString, $options: 'i'}
                        }
                    ]
                }
                finalQuery.push(searchStringQuery) //search query
            }

            //filters 
            if (query.filters) {
                let filtersList = query.filters

                for (let i = 0; i < filtersList.length; i++) {
                    // table of filter values
                    let filterValues = []
                    for (let j = 0; j < filtersList[i].values.length; j++) {
                        if (filtersList[i].name === 'createDate' || filtersList[i].name === 'dutyDate') {
                            filterValues.push({
                                [filtersList[i].name]: {$eq: new Date(filtersList[i].values[j])}
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
        
        // LIMIT EMPLOYEE
        let tasksFilter = [] 
        if (verifiedUser.role == role.EMPLOYEE) {
            const loggedUser = await User.findById({_id: ObjectID(verifiedUser.id)}, {work: 1}).populate('work','_id')
              
            if (loggedUser.work.length === 0) tasksFilter.push({ _id: {$eq: ObjectID(null)} })
            for (let i = 0; i < loggedUser.work.length; i++) {
                tasksFilter.push({
                    _id: {$eq: ObjectID(loggedUser.work[i]._id)}
                })
            }

            finalQuery.push({
                $or: tasksFilter
            }) 
        }

        finalQuery.push({ active: true })

        let match = {
            $and: finalQuery // all search and filters applied
        }

        const result = await Task.paginate(match, options)
        let tasks = []
        for (let i = 0; i < result.items.length; i++) {
            let task = {...result.items[i]._doc}
            task.project = task.idProject
            task.idProject = task.idProject !== null ? task.idProject._id : task.idProject
            tasks = tasks.concat(task)
        }
        result.items = tasks
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

// GET TASK BY ID
router.get('/:taskId', async (req, res) => {
    const response = await getTaskById(req.params.taskId)
    res.json(response)
})

const getTaskById = async (taskId) => {
    try {
        let options = {
            collation: {locale: 'en'},
            customLabels: {
                totalDocs: 'totalResults',
                docs: 'items'
            },
            populate: [{
                path: 'idProject'
            },
            {
                path: 'idReporter',
                select: '-facePhoto -qrCode -password -work -faceAIId'
            },
            {
                path: 'workers',
                select: '-facePhoto -qrCode -password -work -faceAIId'
            }],
        }
        const result = await Task.paginate({_id: ObjectID(taskId), active: true}, options)

        let response = new CommonResponse()
        if (result.items.length > 0) {
            let task = {...result.items[0]._doc}
            task.project = task.idProject
            task.reporter = task.idReporter
            task.idProject = task.idProject !== null ? task.idProject._id : task.idProject
            task.idReporter = task.idReporter !== null ? task.idReporter._id : task.idReporter
            response.success = true;
            response.details = task
        } else throw 'Object not found';

        return response
    } catch(err) {
        let error = new CommonResponse({
            success: false,
            message: err._message ? err._message : err
        })
        return error
    }
}

// CREATE TASK
router.post('/', async (req, res) => {
    const response = await createTask(req.body)
    res.json(response)
})

const createTask = async (data) => {
    try {
        delete data._id
        const task = new Task(data)
        if (task.idProject) {
            if (!task.title || task.title === '') throw 'Title is required'
            const project = await Project.findOne({_id: ObjectID(task.idProject)})
            task.createDate = new Date().setHours(0, 0, 0, 0) 
            task.dutyDate = new Date(task.dutyDate).setHours(24, 0, 0, 0)

            if (task.createDate > project.dutyDate) throw 'Project reached duty date'
            if (!task.dutyDate || task.dutyDate < task.createDate || task.dutyDate > project.dutyDate) throw 'Duty date is invalid'
            task.stringId = await generateStringId(task.title)
            const newTask = await task.save()
            if (newTask.workers.length > 0) await assignWork(newTask._id)

            let response = new CommonResponse({success: true})
            return response
        } else throw 'Project id is required'
        
    } catch(err) {
        let error = new CommonResponse({
            success: false,
            message: err._message ? err._message : err
        })
        return error
    }
}

const assignWork = async (taskId) => {
    try {
        let assignedWorkers = await Task.findById({_id: ObjectID(taskId)}).populate('workers', 'work _id')
 
        for(let i = 0; i < assignedWorkers.workers.length; i++) {
            const work = [...assignedWorkers.workers[i].work, ...[taskId]]
            await User.findByIdAndUpdate({_id: ObjectID(assignedWorkers.workers[i]._id)}, {work: work})
        }
    } catch(err) {
        let error = new CommonResponse({
            success: false,
            message: err._message ? err._message : err
        })
        return error
    }
}


// UPDATE TASK  
router.patch('/:taskId', async (req,res) => {
    const response = await updateTask(req.params.taskId, req.body)
    res.json(response)
})

const updateTask = async (taskId, updateField) => {
    try {
        let task = await Task.findById({_id: ObjectID(taskId)})
        let response = new CommonResponse()
        if (task) {
            if (updateField.stringId) throw 'Can not change task ID'
            if (updateField.createDate) throw 'Can not change creation date'
            if (updateField.title) updateField.stringId = await generateStringId(updateField.title)
            if (updateField.dutyDate) {
                updateField.dutyDate = new Date(updateField.dutyDate).setHours(24, 0, 0, 0)
                let task = await Task.findById({_id: ObjectID(taskId)})
                let project = await Project.findOne({_id: ObjectID(task.idProject)})
                if (updateField.dutyDate < task.createDate || updateField.dutyDate > project.dutyDate) throw 'Duty date is invalid'
            }
            let oldWorkers = []
            if (updateField.workersIds) {
                let assignedWorkers = await Task.findById({_id: ObjectID(taskId)})
                oldWorkers = assignedWorkers.workers
                updateField.workers = updateField.workersIds
            }
            await Task.findByIdAndUpdate({_id: ObjectID(taskId)}, updateField)
            if (updateField.workersIds) {
                await patchWorkers(taskId, updateField.workersIds, oldWorkers)
            }
        
            response.success = true
        } else throw 'Object not found'
        
        return response
    } catch(err) {
        let error = new CommonResponse({
            success: false,
            message: err._message ? err._message : err
        })
        return error
    }
}

const patchWorkers = async (taskId, newWorkers, oldWorkers) =>  {
    try {
        let toAssign = newWorkers.filter(worker => !oldWorkers.includes(worker))
        let toUnassign = oldWorkers.filter(worker => !newWorkers.includes(`${worker}`))

        for (let i = 0; i < toAssign.length; i++) {
            let user = await User.findById({_id: ObjectID(toAssign[i])},{work: 1}).populate('work', '_id')
            const work = [...user.work, ...[taskId]]
            await User.findByIdAndUpdate({_id: ObjectID(user._id)}, {work: work})
        }

        for (let i = 0; i < toUnassign.length; i++) {
            let user = await User.findById({_id: ObjectID(`${toUnassign[i]}`)},{work: 1}).populate('work', '_id')
            const work = user.work.filter(work => `${work._id}` != `${taskId}`)
            await User.findByIdAndUpdate({_id: ObjectID(user._id)}, {work: work})
        }

    } catch(err) {
        let error = new CommonResponse({
            success: false,
            message: err._message ? err._message : err
        })
        return error
    }
}

// DEACTIVATE TASK
router.patch('/deactivate/:taskId', async (req, res) => {
    const response = await deactivateTask(req.params.taskId)
    res.json(response)
})

const deactivateTask = async (taskId) =>  {
    try {
        let task = await Task.findById({_id: ObjectID(taskId)})
        if (!task) throw 'Task not found'
        await closeWorkLogs(taskId)
        await unassignWork(taskId)
        await Task.findByIdAndUpdate({_id: ObjectID(taskId)}, {active: false, workers: []})

        let response = new CommonResponse({success: true})
        return response
    } catch(err) {
        let error = new CommonResponse({
            success: false,
            message: err._message ? err._message : err
        })
        return error
    }
}

const unassignWork = async (taskId) => {
    try {
        let assignedWorkers = await Task.findById({_id: ObjectID(taskId)}).populate('workers', 'work _id')
        for(let i = 0; i < assignedWorkers.workers.length; i++) {
            let work = assignedWorkers.workers[i].work
            work = work.filter(id => id != taskId)
            await User.findByIdAndUpdate({_id: ObjectID(assignedWorkers.workers[i]._id)}, {work: work})
        }
    } catch(err) {
        let error = new CommonResponse({
            success: false,
            message: err._message ? err._message : err
        })
        return error
    }
}

const closeWorkLogs = async (taskId) => {
    try {
        let workers = await Task.findById({_id: ObjectID(taskId)}, {workers: 1})
        for (let i = 0; i < workers.workers.length; i++) {
            let latestLog = await WorkLog.findOne({idUser: ObjectID(workers.workers[i]._id), idTask: ObjectID(taskId)},{}, { sort: { 'logDate' : -1 } })
            if (latestLog.logType != worklogType.CLOSE) {
                let log = new WorkLog({
                    idUser: workers.workers[i]._id,
                    idTask: taskId,
                    logDate: new Date(),
                    logType: worklogType.CLOSE
                })
                await log.save()
            }
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
