const express = require('express')
const { ObjectID } = require('mongodb')
const router = express.Router()
const User = require('../db/models/user')
const Task = require('../db/models/task')
const Project = require('../db/models/project')
const Credentials = require('../db/models/common-models/credentials')
const Query = require('../db/models/common-models/query')
const Pagination = require('../db/models/common-models/pagination')
const QRCode = require('qrcode')
const CommonResponse = require('../db/models/common-models/commonResponse')
const WorkLog = require('../db/models/workLog')
const worklogType = require('../db/models/enums/wroklogType')
const request = require('request-promise');
const jwt = require('jsonwebtoken');
const role = require('../db/models/enums/role')
const bcrypt = require('bcrypt-nodejs')

// generate QR code
const generateQR = async (credentials) => {
    try {
        const qrCode = await QRCode.toDataURL(JSON.stringify(credentials))
        return qrCode
    } catch(err) {
        let error = new CommonResponse({
            success: false,
            message: err._message ? err._message : err
        })
        return error
    }
}

// is login available 
const isLoginAvailable = async (login) => {
    const user = await User.findOne({login: login, active: true})
    if (user !== null) throw 'Login is taken'
}

// GET ALL USERS
router.get('/', async (req, res) => {
    const token = req.header('auth-token');
    const verified = jwt.verify(token, process.env.TOKEN_SECRET);

    const response = await getUsers(req.query, verified)
    res.json(response)
})

const getUsers = async (reqQuery, verifiedUser) => {
    try {
        if (verifiedUser.role == role.EMPLOYEE) throw 'No access'

        let options = {
            collation: {locale: 'en'},
            customLabels: {
                totalDocs: 'totalResults',
                docs: 'items'
            },
            select: '-qrCode -facePhoto -password -faceAIId', // exclude fields
            sort: {
                role: -1,
                lastName: 1
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
                            firstName: {$regex: searchString, $options: 'i'}
                        },
                        {
                            lastName: {$regex: searchString, $options: 'i'}
                        },
                        {
                            email: {$regex: searchString, $options: 'i'}
                        },
                        {
                            role: {$regex: searchString, $options: 'i'}
                        },
                        {
                            login: {$regex: searchString, $options: 'i'}
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
                        filterValues.push({
                            [filtersList[i].name]: {$eq: filtersList[i].values[j]}
                        })
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

        finalQuery.push({ active: true })

        let match = {
            $and: finalQuery // all search and filters applied
        }

        const result = await User.paginate(match, options)
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

// GET USER BY ID
router.get('/:userId', async (req, res) => {
    const response = await getUserById(req.params.userId)
    res.json(response)
})

const getUserById = async (userId) => {
    try {
        let options = {
            collation: {locale: 'en'},
            customLabels: {
                totalDocs: 'totalResults',
                docs: 'items'
            },
            select: '-facePhoto -qrCode -password -faceAIId',
            populate: [{
                path: 'work',
                select: '-workers'
            }],
        }
        const result = await User.paginate({_id: ObjectID(userId), active: true}, options)

        let response = new CommonResponse()
        if (result.items.length > 0) {
            let user = {...result.items[0]._doc}
            response.success = true;
            response.details = user
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

//GET USER CREDENTIALS
router.get('/credentials/:userId', async (req, res) => {
    const response = await getUserCredentials(req.params.userId)
    res.json(response)
})

const getUserCredentials = async (userId) => {
    try {
        const result = await User.findById({_id: ObjectID(userId)}, {facePhoto: 1, qrCode: 1})

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

// UPDATE USER
router.patch('/:userId', async (req,res) => {
    const response = await updateUser(req.params.userId, req.body)
    res.json(response)
})

const updateUser = async (userId, updateField) => {
    try {
        let user = await User.findById({_id: ObjectID(userId)})
        let response = new CommonResponse()
        if (user) {
            if (updateField.login) throw 'Can not update login'
            if (updateField.password) { // update qrcode on password change
                const user = await User.findById({_id: ObjectID(userId)})

                const credentials = new Credentials({login: user.login, password: updateField.password})
                updateField.qrCode = await generateQR(credentials)

                const hashPassword = bcrypt.hashSync(updateField.password)
                updateField.password = hashPassword
            }
            let oldWork = []
            if (updateField.workIds) {
                let assignedWork = await User.findById({_id: ObjectID(userId)})
                oldWork =  assignedWork.work
                updateField.work = updateField.workIds
            }
            await User.findByIdAndUpdate({_id: ObjectID(userId)}, updateField)
            if (updateField.workIds) await patchWork(userId, updateField.workIds, oldWork)
            const user = await User.findById({_id: ObjectID(`${userId}`)},{facePhoto: 0})
            if (updateField.facePhoto !== undefined) await deleteAIPersonFace(user.faceAIId)
            if (updateField.facePhoto !== undefined && updateField.facePhoto.length > 0) {
                await addAIPersonFace(user.faceAIId, updateField.facePhoto)
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

const patchWork = async (userId, newWork, oldWork) =>  {
    try {
        let toAssign = newWork.filter(work => !oldWork.includes(work))
        let toUnassign = oldWork.filter(work => !newWork.includes(`${work}`))

        for (let i = 0; i < toAssign.length; i++) {
            let task = await Task.findById({_id: ObjectID(toAssign[i])}, {workers: 1}).populate('workers', '_id')
            const workers = [...task.workers, ...[userId]]
            await Task.findByIdAndUpdate({_id: ObjectID(task._id)}, {workers: workers})
        }

        for (let i = 0; i < toUnassign.length; i++) {
            let task = await Task.findById({_id: ObjectID(`${toUnassign[i]}`)}, {workers: 1}).populate('workers', '_id')
            const workers = task.workers.filter(worker => `${worker._id}` != `${userId}`)
            await Task.findByIdAndUpdate({_id: ObjectID(task._id)}, {workers: workers})
        }

    } catch(err) {
        let error = new CommonResponse({
            success: false,
            message: err._message ? err._message : err
        })
        return error
    }
}


// CREATE USER
router.post('/', async (req, res) => {
    const response = await createUser(req.body)
    res.json(response)
})

const createUser = async (data) => {
    try {
        delete data._id
        const newUser = new User(data)
        await isLoginAvailable(newUser.login)
        
        const credentials = new Credentials({login: newUser.login, password: newUser.password})
        newUser.qrCode = await generateQR(credentials)

        const hashPassword = bcrypt.hashSync(newUser.password)
        newUser.password = hashPassword
        await newUser.save()
        if (newUser.work.length > 0) await assignWorkers(newUser._id)
        let AIId = await createAIPerson(newUser._id)
        if (newUser.facePhoto) {
            await addAIPersonFace(AIId, newUser.facePhoto)}

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

const createAIPerson = async (userId) => {
    try {
        const options = {
            method: 'POST',
            url: 'https://luxand-cloud-face-recognition.p.rapidapi.com/subject',
            headers: {
              'content-type': 'application/x-www-form-urlencoded',
              'x-rapidapi-key': process.env.RAPID_API_KEY,
              'x-rapidapi-host': 'luxand-cloud-face-recognition.p.rapidapi.com',
              useQueryString: true
            },
            form: {name: `${userId}`}
          };

          let AIId = 0;
        await request(options, async (err, res, body) => {
            if (err) throw new Error(err.message);
            AIId = JSON.parse(body).id
            await User.findByIdAndUpdate({_id: ObjectID(`${userId}`)}, {faceAIId: AIId})
        });

        return AIId
          
    } catch(err) {
        let error = new CommonResponse({
            success: false,
            message: err._message ? err._message : err
        })
        return error
    }
}

const addAIPersonFace = async (AIId, file) => {
    try {
        const options = {
            method: 'POST',
            url: `https://luxand-cloud-face-recognition.p.rapidapi.com/subject/${AIId}`,
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                'x-rapidapi-key': process.env.RAPID_API_KEY,
                'x-rapidapi-host': 'luxand-cloud-face-recognition.p.rapidapi.com',
                useQueryString: true
            },
            form: {photo: `${file.split(',')[1]}`}
        };

        await request(options, async (err, res, body) => {
            if (err) throw new Error(err.message);
        });
          
    } catch(err) {
        let error = new CommonResponse({
            success: false,
            message: err._message ? err._message : err
        })
        return error
    }
}

const deleteAIPerson = async (userId, AIId) => {
    try {
        const options = {
            method: 'DELETE',
            url: `https://luxand-cloud-face-recognition.p.rapidapi.com/subject/${AIId}`,
            headers: {
              'x-rapidapi-key': process.env.RAPID_API_KEY,
              'x-rapidapi-host': 'luxand-cloud-face-recognition.p.rapidapi.com',
              useQueryString: true
            }
          };

        await request(options, async (err, res, body) => {
            if (err) throw new Error(err.message);
            await User.findByIdAndUpdate({_id: ObjectID(`${userId}`)}, {faceAIId: null})
        });
          
          
    } catch(err) {
        let error = new CommonResponse({
            success: false,
            message: err._message ? err._message : err
        })
        return error
    }
}

const deleteAIPersonFace = async (AIId) => {
    try {
        const getFaceListOptions = {
            method: 'GET',
            url: `https://luxand-cloud-face-recognition.p.rapidapi.com/subject/${AIId}`,
            headers: {
              'x-rapidapi-key': process.env.RAPID_API_KEY,
              'x-rapidapi-host': 'luxand-cloud-face-recognition.p.rapidapi.com',
              useQueryString: true
            }
        };

        let lastFaceId = 0;
        await request(getFaceListOptions, async (err, res, body) => {
            if (err) throw new Error(err.message);
            if (JSON.parse(body)[0]) lastFaceId = JSON.parse(body)[0].id
        });

        if (lastFaceId != 0) {
            const delFaceOptions = {
                method: 'DELETE',
                url: `https://luxand-cloud-face-recognition.p.rapidapi.com/subject/${AIId}/${lastFaceId}`,
                headers: {
                  'x-rapidapi-key': process.env.RAPID_API_KEY,
                  'x-rapidapi-host': 'luxand-cloud-face-recognition.p.rapidapi.com',
                  useQueryString: true
                }
              };
    
            await request(delFaceOptions, async (err, res, body) => {
                if (err) throw new Error(err.message);
            });
        }
          
    } catch(err) {
        let error = new CommonResponse({
            success: false,
            message: err._message ? err._message : err
        })
        return error
    }
}

const assignWorkers = async (userId) => {
    try {
        let assignedWork = await User.findById({_id: ObjectID(userId)}).populate('work', 'workers _id')
        for(let i = 0; i < assignedWork.work.length; i++) {
            const workers = [...assignedWork.workers[i].work, ...[userId]]
            await Task.findByIdAndUpdate({_id: ObjectID(assignedWork.work[i]._id)}, {workers: workers})
        }
    } catch(err) {
        let error = new CommonResponse({
            success: false,
            message: err._message ? err._message : err
        })
        return error
    }
}

// DEACTIVATE USER
router.patch('/deactivate/:userId', async (req, res) => {
    const response = await deactivateUser(req.params.userId)
    res.json(response)
})

const deactivateUser = async (userId) =>  {
    try {
        let user = await User.findById({_id: ObjectID(userId)})
        if (!user) throw 'User not found'
        let isManagerIn = await Project.find({idManager: userId})
        if (isManagerIn.length === 0 ) {
            await closeWorkLogs(userId)
            await unassignWork(userId)
            await deleteAIPerson(userId, user.faceAIId)
            await User.findByIdAndUpdate({_id: ObjectID(userId)}, {active: false, workers: []})

            let response = new CommonResponse({success: true})
            return response
        }
        let response = new CommonResponse({
            success: false,
            message: 'User is manager',
            details: isManagerIn // return projects where user is manager
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

const unassignWork = async (userId) => {
    try {
        let assignedWork = await User.findById({_id: ObjectID(taskId)}).populate('work', 'workers _id')
        for(let i = 0; i < assignedWork.work.length; i++) {
            let workers = assignedWork.work[i].workers
            workers = workers.filter(id => id != userId)
            await Task.findByIdAndUpdate({_id: ObjectID(assignedWork.work[i]._id)}, {workers: workers})
        }
    } catch(err) {
        let error = new CommonResponse({
            success: false,
            message: err._message ? err._message : err
        })
        return error
    }
}

const closeWorkLogs = async (userId) => {
    try {
        let work = await User.findById({_id: ObjectID(userId)}, {work: 1})
        for (let i = 0; i < work.work.length; i++) {
            let latestLog = await WorkLog.findOne({idTask: ObjectID(work.work[i]._id), idUser: ObjectID(userId)},{}, { sort: { 'logDate' : -1 } })
            if (latestLog.logType != worklogType.CLOSE) {
                let log = new WorkLog({
                    idUser: work.work[i]._id,
                    idTask: userId,
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