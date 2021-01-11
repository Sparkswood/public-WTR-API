const express = require('express')
const { ObjectID } = require('mongodb')
const router = express.Router()
const Project = require('../db/models/project')
const Task = require('../db/models/task')
const Query = require('../db/models/common-models/query')
const Pagination = require('../db/models/common-models/pagination')
const CommonResponse = require('../db/models/common-models/commonResponse')
const User = require('../db/models/user')
const jwt = require('jsonwebtoken');
const WorkLog = require('../db/models/workLog')
const worklogType = require('../db/models/enums/wroklogType')
const role = require('../db/models/enums/role')

// GENERATE STRING ID
const generateStringId = async (title) => {
    try {
        const words = title.split(' ')
        let acronym = ''
        for (let i = 0; i < words.length; i++) {
            acronym = acronym.concat(words[i].charAt(0))
        }
        const searchString = `proj_${acronym}_`
        let stringProjects = await Project.find(
            {
                stringId: { $regex: searchString, $options: 'i' }
            }
        )
        const stringId = searchString + (stringProjects.length + 1)

        return stringId
    } catch(err) {
        let error = new CommonResponse({
            success: false,
            message: err._message ? err._message : err
        })
        return error
    }
}

// GET ALL PROJECTS
router.get('/', async (req, res) => {
    const token = req.header('auth-token');
    const verified = jwt.verify(token, process.env.TOKEN_SECRET);

    const response = await getProjects(req.query, verified)
    res.json(response)
})

const getProjects = async (reqQuery, verifiedUser) => {
    try {
        let options = {
            collation: {locale: 'en'},
            customLabels: {
                totalDocs: 'totalResults',
                docs: 'items'
            },
            sort: {
                dutyDate: 1,
                title: 1
            },
            populate: {
                path: 'idManager',
                select: '-facePhoto -qrCode -password -faceAIId'
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
        let userProjects = []
        let projectsFilter = [] 
        if (verifiedUser.role == role.EMPLOYEE) {
            const loggedUser = await User.findById({_id: ObjectID(verifiedUser.id)},{work: 1}).populate('work','idProject')
              
            for (let i = 0; i < loggedUser.work.length; i++) {
                if (userProjects.indexOf(loggedUser.work[i].idProject) == -1) userProjects.push(loggedUser.work[i].idProject)
            }
            if (userProjects.length === 0) userProjects.push(null);
            for (let i = 0; i < userProjects.length; i++) {
                projectsFilter.push({
                    _id: {$eq: ObjectID(userProjects[i])}
                })
                
            }
            finalQuery.push({
                $or: projectsFilter
            }) 
        }

        finalQuery.push({ active: true })

        let match = {
            $and: finalQuery // all search and filters applied
        }

        let result = await Project.paginate(match, options)

        let projects = []
        for (let i = 0; i < result.items.length; i++) {
            let project = {...result.items[i]._doc}
            let noDuplicateWorkers = await getProjectWorkers(project._id)
            if (noDuplicateWorkers.message) throw noDuplicateWorkers.message
            project.workers = noDuplicateWorkers
            projects = projects.concat(project)
        }

        result.items = projects
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

const getProjectWorkers = async (projectId) => {
    try {
        let projectTasks = await Task.find({idProject: projectId})
        let workers = []
        for (let j = 0; j < projectTasks.length; j++) {
            workers = workers.concat(projectTasks[j].workers)
        }
        let noDuplicateWorkers = []
        workers.forEach(worker => {
            if (noDuplicateWorkers.indexOf(`${worker}`) == -1)  noDuplicateWorkers.push(`${worker}`)
        })

        return noDuplicateWorkers

    } catch(err) {
        let error = new CommonResponse({
            success: false,
            message: err._message ? err._message : err
        })
        return error
    }
}

// GET PROJECT BY ID
router.get('/:projectId', async (req, res) => {
    const response = await getProjectById(req.params.projectId)
    res.json(response)
})

const getProjectById = async (projectId) => {
    try {
        let options = {
            collation: {locale: 'en'},
            customLabels: {
                totalDocs: 'totalResults',
                docs: 'items'
            },
            select: '-facePhoto -qrCode -password  -faceAIId',
            populate: [{
                path: 'idManager',
                select: '-facePhoto -qrCode -password -work  -faceAIId'
            }],
        }
        const result = await Project.paginate({_id: ObjectID(projectId), active: true}, options)
        let response = new CommonResponse()
        if (result.items.length > 0) {
            let project = {...result.items[0]._doc}
            let noDuplicateWorkers = await getProjectWorkers(project._id)
            if (noDuplicateWorkers.message) throw noDuplicateWorkers.message
            project.workers = noDuplicateWorkers
            response.success = true;
            response.details = project
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

// UPDATE PROJECT
router.patch('/:projectId', async (req,res) => {
    const response = await updateProject(req.params.projectId, req.body)
    res.json(response)
})

const updateProject = async (projectId, updateField) => {
    try {
        let project = await Project.findById({_id: ObjectID(projectId)})
        let response = new CommonResponse()
        if (project) {
            if (updateField.stringId) throw 'Can not change project ID'
            if (updateField.createDate) throw 'Can not change creation date'
            if (updateField.title) updateField.stringId = await generateStringId(updateField.title)
            if (updateField.dutyDate) {
                updateField.dutyDate = new Date(updateField.dutyDate).setHours(24, 0, 0, 0)
                if (updateField.dutyDate < new Date()) throw 'Duty date can not be set on past'

                let tasks = await Task.find({idProject: ObjectID(projectId)}, {_id: 1, dutyDate: 1})
                for (let i = 0; i < tasks.length; i++) {
                    if (new Date(tasks[i].dutyDate) > updateField.dutyDate) {
                        await Task.findByIdAndUpdate({_id: ObjectID(tasks[i]._id)}, {dutyDate: updateField.dutyDate})
                    }
                }
            }

            await Project.findByIdAndUpdate({_id: ObjectID(projectId)}, updateField)

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

// CREATE PROJECT
router.post('/', async (req, res) => {
    const response = await createProject(req.body)
    res.json(response)
})

const createProject = async (data) => {
    try {
        const project = new Project(data)
        if (!project.title || project.title === '') throw 'Title is required'
        project.createDate = new Date().setHours(0, 0, 0, 0)
        project.dutyDate = new Date(project.dutyDate).setHours(24, 0, 0, 0)
        if (!project.dutyDate || project.dutyDate < project.createDate) throw 'Duty date is invalid'
        project.stringId = await generateStringId(project.title)
        await project.save()

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

// DEACTIVATE PROJECT
router.patch('/deactivate/:projectId', async (req, res) => {
    const response = await deactivateProject(req.params.projectId)
    res.json(response)
})

const deactivateProject = async (projectId) =>  {
    try {
        let project = await Project.findById({_id: ObjectID(projectId)})
        if (!project) throw 'Project not found'

        let allTasks = await Task.find({idProject: ObjectID(projectId)}, {_id: 1})
        for (let i = 0; i < allTasks.length; i++) {
            await deactivateTask(allTasks[i]._id)
        }
        await Project.findByIdAndUpdate({_id: ObjectID(projectId)}, {active: false})

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

const deactivateTask = async (taskId) =>  {
    try {
        let task = await Task.findById({_id: ObjectID(taskId)})
        if (!task) throw 'Task not found'
        await closeWorkLogs(taskId)
        await unassignWork(taskId)
        await Task.findByIdAndUpdate({_id: ObjectID(taskId)}, {active: false, workers: []})
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