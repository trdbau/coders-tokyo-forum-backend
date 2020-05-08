const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom')

let uploadAvatarValidate = (req, res, next) => {
  let schema = Joi.object().keys({
    avatar: Joi.object().required()
  })

  const { error } = schema.validate(req.body)
  if (error) {
    throw Boom.badRequest(error.message)
  }

  return next()
}

let updateProfileValidate = (req, res, next) => {
  let schema = Joi.object().keys({
    username: Joi.string().optional(),
    sex: Joi.string().optional(),
    age: Joi.number().optional(),
    job: Joi.string().optional(),
    hobbies: Joi.array().items(Joi.string()).optional(),
    description: Joi.string().allow('').optional(),
    socialLinks: Joi.array().items(
      Joi.object(({
        type: Joi.string().required(),
        url: Joi.string().required(),
        _id: Joi.string().optional()
      }))
    ).optional(),
  })

  const { error } = schema.validate(req.body)
  if (error) {
    throw Boom.badRequest(error.message)
  }

  return next()
}

module.exports = {
  uploadAvatarValidate,
  updateProfileValidate
};