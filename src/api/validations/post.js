const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom')


let createPostValidate = (req, res, next) => {
  let schema = Joi.object().keys({
    topic: Joi.string().required(),
    description: Joi.string().required(),
    content: Joi.string().required(),
    type: Joi.string().valid(
      'song',
      'blog',
      'book',
      'food',
      'movie',
      'video',
      'podcast',
      'discussion'
    ).required(),
    tags: Joi.array().items(Joi.string().required()).optional(),
    authors: Joi.array().items({
      name: Joi.string().required(),
      type: Joi.string().valid(
        'author',
        'singer',
        'composer',
        'actor',
        'actress',
        'director'
      ).required()
    }).when('type', {
      is: Joi.valid('song', 'book', 'movie', 'podcast'),
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    coverImage: Joi.object().when('type', {
      is: Joi.valid('food', 'movie', 'book', 'blog'),
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    isUpload: Joi.boolean().optional(),
    url: Joi.string().when('isUpload', {
      is: false,
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    video: Joi.object().keys({}).when('isUpload', {
      is: true,
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    audio: Joi.object().when('type', {
      is: Joi.valid('song', 'podcast'),
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    food: Joi.object().keys({
      foodName: Joi.string().required(),
      url: Joi.string().optional(),
      price: Joi.string().required(),
      location: Joi.string().optional(),
      star: Joi.number().optional()
    }).when('type', {
      is: 'food',
      then: Joi.required(),
      otherwise: Joi.optional()
    }),
    foodPhotos: Joi.array().when('type', {
      is: 'food',
      then: Joi.required(),
      otherwise: Joi.optional()
    })
  })

  console.log(req.body, req.files)
  req.files = JSON.parse(JSON.stringify(req.files))
  req.body = JSON.parse(JSON.stringify(req.body))

  let reqData = req.body;
  reqData.type = req.query.type
  reqData.isUpload = req.query.isUpload
  if (req.files.coverImage) {
    reqData.coverImage = req.files['coverImage'][0]
  }
  if (req.files.audio) {
    reqData.audio = req.files['audio'][0]
  }

  if (req.files.foodPhotos) {
    reqData.foodPhotos = req.files['foodPhotos'].map(photo => photo)
  }

  const { error } = schema.validate(reqData)
  if (error) {
    throw Boom.badRequest(error.message)
  }

  return next()
}

module.exports = {
  createPostValidate,
};