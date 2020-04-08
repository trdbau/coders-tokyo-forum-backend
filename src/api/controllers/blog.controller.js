const Boom = require('@hapi/boom');
const Utils = require('@utils');
const Post = require('@models').Post;
const Promise = require('bluebird');
const cloudinary = require('cloudinary').v2;
const { coverImageConfig } = require('@configVar');

exports.createBlog = async (req, res, next, type) => {
  const coverImage = req.files['coverImage'][0].path;
  const {
    body: { tags },
    user,
  } = req;
  try {
    const newBlog = {
      userId: user._id,
      ...req.body,
      type,
    }

    let promises = [cloudinary.uploader.upload(coverImage, coverImageConfig)]
    if (tags) {
      promises.push(Utils.post.createTags(tags))
    }

    const [coverImageUploaded, blogTags] = await Promise.all(promises)
    const cover = {
      public_id: coverImageUploaded.public_id,
      url: coverImageUploaded.url,
      secure_url: coverImageUploaded.secure_url,
    };
    newBlog.cover = cover;
    if (blogTags) newBlog.tags = blogTags.map(tag => tag._id)

    let createdBlog = await new Post(newBlog).save()
    let dataRes = {
      _id: createdBlog._id,
      topic: createdBlog.topic,
      description: createdBlog.description,
      content: createdBlog.content,
      type: createdBlog.type,
      tags: blogTags || [],
      cover,
      createdAt: createdBlog.createdAt,
    }
    return res.status(200).json({
      status: 200,
      data: dataRes,
    });
  } catch (error) {
    return next(error);
  }
};

exports.editBlog = async (req, res, next, type) => {
  const { topic, description, content, tags } = req.body;
  try {
    const blog = await Post.findOne({
      _id: req.params.postId,
      type,
    })
      .lean()
      .populate({ path: 'tags', select: '_id tagName' });

    if (!blog) {
      throw Boom.badRequest('Not found blog');
    }

    let query = {};
    if (topic) query.topic = topic;
    if (description) query.description = description;
    if (content) query.content = content;
    if (tags) {
      const newTags = await Utils.post.removeOldTagsAndCreatNewTags(
        blog,
        tags,
      );
      query.tags = newTags;
    }

    const files = req.files || {};
    const coverImageInput = files['coverImage'] || null;
    if (coverImageInput) {
      const coverImage = coverImageInput[0].path;
      const oldCover = blog.cover || {};
      const oldCoverId = oldCover.public_id || 'null'; // 2 cases: public_id || null -> assign = 'null'

      const data = { oldImageId: oldCoverId, newImage: coverImage };
      try {
        const uploadedCoverImage = await Utils.cloudinary.deleteOldImageAndUploadNewImage(
          data,
          coverImageConfig,
        );

        query.cover = {
          public_id: uploadedCoverImage.public_id,
          url: uploadedCoverImage.url,
          secure_url: uploadedCoverImage.secure_url,
        };
      } catch (error) {
        throw Boom.badRequest(error.message);
      }
    }

    const upadatedBlog = await Post.findByIdAndUpdate(
      req.params.postId,
      {
        $set: query,
      },
      { new: true },
    )
      .lean()
      .populate({ path: 'tags', select: 'tagName' })
      .select('-__v -media -url -authors');

    return res.status(200).json({
      status: 200,
      data: upadatedBlog,
    });
  } catch (error) {
    return next(error);
  }
};

exports.deleteBlog = async (req, res, next, type) => {
  try {
    const blog = await Post.findOne({
      _id: req.params.postId,
      type,
    }).lean();
    if (!blog) {
      throw Boom.badRequest('Not found blog');
    }

    let result = await Promise.props({
      isDeletedBlog: Post.findByIdAndDelete(req.params.postId),
      isDeletedCoverImage: cloudinary.uploader.destroy(blog.cover.public_id),
    });

    if (!result.isDeletedBlog) {
      throw Boom.badRequest('Delete blog failed')
    }

    return res.status(200).json({
      status: 200,
      message: `Delete blog successfully`,
    });
  } catch (error) {
    return next(error);
  }
};
