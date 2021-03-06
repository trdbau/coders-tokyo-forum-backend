const Boom = require('@hapi/boom');
const { Comment, Post, User, Notif } = require('@models');
const Utils = require('@utils');
const mongoose = require('mongoose');
const configVar = require('@configVar');
const Redis = require('ioredis');
const redis = new Redis(configVar.redis_uri);

exports.createComment = async (req, res, next) => {
  try {
    const { content } = req.body;
    const { postId } = req.params;

    const userId = req.user._id;
    const user = await User.findById(userId).lean().populate({
      path: 'avatar',
      select: '_id secureURL'
    }).select('_id username avatar');
    if (!user) {
      throw Boom.badRequest('Please login to comment');
    }
    const post = await Post.findById(postId)
      .lean()
      .select('_id type likes user')
      .populate([
        {
          path: 'cover',
          select: '_id secureURL'
        },
        {
          path: 'user',
          select: '_id username',
          populate: {
            path: 'avatar',
            select: '_id secureURL'
          }
        },
      ]);
    if (!post) {
      throw Boom.badRequest('Not found post');
    }

    const data = {
      postId,
      content,
      user: userId,
      parentId: null,
      replyToComment: null
    };

    const comment = new Comment(data);
    let promises = [
      Post.findByIdAndUpdate(
        postId,
        {
          $push: { comments: comment._id },
        },
        { new: true },
      ),
      comment.save()
    ];

    const [_, savedComment] = await Promise.all(promises);

    if (!savedComment) {
      throw Boom.badRequest('Make comment failed');
    }
    const dataSocket = {
      _id: savedComment._id,
      childComments: [],
      content: savedComment.content,
      createdAt: savedComment.createdAt,
      parentId: null,
      replyToComment: null,
      postId,
      user,
      type: 'comment'
    };
    redis.publish(configVar.SOCKET_NEW_COMMENT, JSON.stringify(dataSocket));

    if (post.user._id.toString() != user._id.toString()) {
      let type = post.type;
      let typeParams = post.type;
      let path = `/${typeParams}s/${post._id}?type=${type}`;
      if (post.type === 'book' || post.type === 'movie' || post.type === 'food') {
        type = post.type + ' review';
        typeParams = `${post.type}Review`;
        path = `/${typeParams}s/${post._id}?type=${post.type}`
      }
      const text = `**${user.username}** commented on your ${type}`;
      const newNotif = await new Notif({
        post: post._id,
        creator: user._id,
        user: post.user._id,
        content: text,
        path,
      }).save();

      let dataNotifSocket = {
        content: text,
        notif: {
          _id: newNotif._id,
          isRead: false,
          isRead: false,
          content: text,
          post,
          path,
          creator: user,
          userId: post.user._id,
          createdAt: newNotif.createdAt,
        }
      };
      redis.publish(configVar.SOCKET_NOTIFICATION, JSON.stringify(dataNotifSocket));
    }

    return res
      .status(200)
      .json({ status: 200, data: savedComment });

  } catch (error) {
    return next(error);
  }
};

exports.replyComment = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).lean().populate({
      path: 'avatar',
      select: '_id secureURL'
    }).select('_id username avatar');
    const { commentId } = req.params;
    const { content } = req.body;

    const parentComment = await Comment.findById(commentId).lean().populate([
      {
        path: 'user',
        select: '_id username createdAt',
      },
      {
        path: 'postId',
        select: '_id type likes user',
        populate: [
          {
            path: 'cover',
            select: '_id secureURL'
          },
          {
            path: 'user',
            select: '_id username',
            populate: {
              path: 'avatar',
              select: '_id secureURL'
            }
          },
        ]
      }
    ]);
    if (!parentComment) {
      throw Boom.badRequest('Not found comment to reply');
    }

    const data = {
      postId: parentComment.postId,
      content,
      user: userId,
      parentId: parentComment._id,
      replyToComment: parentComment._id,
    };

    const comment = new Comment(data);

    const promises = [
      comment.save(),
      Comment.findByIdAndUpdate(
        commentId,
        { $push: { childComments: comment._id } },
        { new: true }
      )
    ];

    const [newComment] = await Promise.all(promises);

    let dataRes = {
      _id: newComment._id,
      childComments: [],
      postId: newComment.postId,
      parentId: newComment.parentId,
      replyToComment: parentComment,
      content: newComment.content,
      user,
      createdAt: newComment.createdAt,
      type: 'replyComment'
    };

    redis.publish(configVar.SOCKET_NEW_COMMENT, JSON.stringify({
      ...dataRes,
      postId: parentComment.postId._id
    }));
    if (parentComment.user._id.toString() != user._id.toString()) {
      let type = parentComment.postId.type;
      let typeParams = type;
      let path = `/${typeParams}s/${parentComment.postId._id}?type=${type}`;
      if (type === 'book' || type === 'movie' || type === 'food') {
        type = type + ' review';
        typeParams = `${type}Review`;
        path = `/${typeParams}s/${parentComment.postId._id}?type=${type}`
      }
      const text = `**${user.username}** replied to your comment`;
      const newNotif = await new Notif({
        post: parentComment.postId._id,
        creator: user._id,
        user: parentComment.user._id,
        content: text,
        notif: text,
        path
      }).save();

      let dataNotifSocket = {
        content: text,
        notif: {
          _id: newNotif._id,
          isRead: false,
          content: text,
          post: parentComment.postId,
          creator: user,
          path,
          userId: parentComment.user._id,
          createdAt: newNotif.createdAt,
        },
      };

      redis.publish(configVar.SOCKET_NOTIFICATION, JSON.stringify(dataNotifSocket));
    }

    return res
      .status(200)
      .json({ status: 200, data: dataRes });

  } catch (error) {
    return next(error);
  }
};

exports.threadReplyComment = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).lean().populate({
      path: 'avatar',
      select: '_id secureURL'
    }).select('_id username avatar');
    const { commentId, parentId } = req.params;
    const { content } = req.body;

    const parentComment = await Comment.findById(parentId).lean().populate([
      {
        path: 'user',
        select: '_id username createdAt',
      },
      {
        path: 'postId',
        select: '_id type likes user',
        populate: [
          {
            path: 'cover',
            select: '_id secureURL'
          },
          {
            path: 'user',
            select: '_id username',
            populate: {
              path: 'avatar',
              select: '_id secureURL'
            }
          },
        ]
      }
    ]);
    const comment = await Comment.findById(commentId).lean().populate({
      path: 'user',
      select: '_id username createdAt',
    });

    if (!parentComment || !comment) {
      throw Boom.badRequest("Not found thread or comment to reply");
    }
    const data = {
      postId: parentComment.postId,
      content,
      user: userId,
      parentId: parentId,
      replyToComment: commentId
    };

    const newComment = new Comment(data);

    const promises = [
      newComment.save(),
      Comment.findByIdAndUpdate(
        parentId,
        { $push: { childComments: newComment._id } },
        { new: true }
      )
    ];

    const [createdComment, _] = await Promise.all(promises);

    let dataRes = {
      _id: createdComment._id,
      childComments: [],
      postId: createdComment.postId,
      parentId: createdComment.parentId,
      thread: parentComment,
      replyToComment: comment,
      content: createdComment.content,
      user,
      createdAt: createdComment.createdAt,
      type: 'threadReplyComment'
    };

    redis.publish(configVar.SOCKET_NEW_COMMENT, JSON.stringify({
      ...dataRes,
      postId: parentComment.postId._id
    }));

    if (comment.user._id.toString() != user._id.toString()) {
      let type = parentComment.postId.type;
      let typeParams = type;
      let path = `/${typeParams}s/${parentComment.postId._id}?type=${type}`;
      if (type === 'book' || type === 'movie' || type === 'food') {
        type = type + ' review';
        typeParams = `${type}Review`;
        path = `/${typeParams}s/${parentComment.postId._id}?type=${type}`
      }
    const text = `**${user.username}** replied to your comment`;
    const newNotif = await new Notif({
      post: parentComment.postId._id,
      creator: user._id,
      user: parentComment.user._id,
      content: text,
      path
    }).save();

    let dataNotifSocket = {
      content: text,
      notif: {
        _id: newNotif._id,
        isRead: false,
        content: text,
        post: parentComment.postId,
        creator: user,
        userId: comment.user._id,
        createdAt: newNotif.createdAt,
        path
      },
    };
    redis.publish(configVar.SOCKET_NOTIFICATION, JSON.stringify(dataNotifSocket));
    }

    return res
      .status(200)
      .json({ status: 200, data: dataRes });

  } catch (error) {
    return next(error);
  }
};

exports.editComment = async (req, res, next) => {
  try {
    const comment = await Comment.findOne({
      _id: req.params.commentId,
      user: req.user._id,
    });
    if (!comment) {
      throw Boom.badRequest('Not found comment');
    }

    const updatedComment = await Comment.findByIdAndUpdate(
      commentId,
      {
        $set: { content: req.body.content }
      },
      { new: true }
    );

    if (!updatedComment) {
      throw Boom.badRequest('Edit comment failed');
    }

    // redis.publish(configVar.SOCKET_EDIT_COMMENT, JSON.stringify({
    //   ...data,
    //   postId: comment.postId
    // }));

    return res
      .status(200)
      .json({ status: 200, data: updatedComment });
  } catch (error) {
    return next(error);
  }
};

exports.deleteComment = async (req, res, next) => {
  try {
    const { commentId } = req.params;
    const comment = await Comment.findById(commentId)
      .lean()
      .populate({
        path: 'postId',
        select: '_id'
      })
      .populate({
        path: 'parentId',
        select: '_id'
      });
    if (!comment) {
      throw Boom.badRequest('Not found comment');
    }

    let promises = [
      Post.findByIdAndUpdate(
        comment.postId._id,
        {
          $pull: { comments: commentId },
        },
        { new: true },
      ),
      Comment.findByIdAndDelete(commentId).lean(),
    ];

    if (comment.parentId && comment.parentId._id) {
      promises.push(
        Comment.findByIdAndUpdate(
          comment.parentId._id,
          {
            $pull: { childComments: commentId },
          },
          { new: true },
        ),
      );
    }
    const [deleteInPost, deletedComment] = await Promise.all(promises);

    if (!deletedComment || !deleteInPost) {
      throw Boom.badRequest('Delete comment failed');
    }

    if (comment.parentId && comment.parentId._id) {
      redis.publish(configVar.SOCKET_DELETE_COMMENT, JSON.stringify({
        commentId,
        parentId: comment.parentId._id,
        postId: comment.postId._id,
        type: 'replyComment'
      }));
    } else {
      redis.publish(configVar.SOCKET_DELETE_COMMENT, JSON.stringify({
        commentId,
        postId: comment.postId._id,
        type: 'comment'
      }));
    }

    return res
      .status(200)
      .json({ status: 200, message: 'Delete comment success' });
  } catch (error) {
    return next(error);
  }
};

exports.loadmoreComments = async (req, res, next) => {
  try {
    const {
      query: { page, limit },
      params: { postId }
    } = req;
    const [_page, _limit] = Utils.post.standardizePageLimitComment5(page, limit);

    const post = await Post.findById(postId).lean();
    if (!post) throw Boom.badRequest('Not found post');

    const [comments, counter] = await Promise.all([
      Post.findById(postId)
        .lean()
        .select('comments')
        .populate({
          path: 'comments',
          options: {
            sort: { createdAt: -1 },
            limit: _limit,
            skip: (_page - 1) * _limit
          },
          populate: [
            {
              path: 'user',
              select: '_id username job avatar',
              populate: {
                path: 'avatar',
                select: '_id secureURL'
              }
            },
            {
              path: 'childComments',
              select: 'content createdAt parentId',
              options: {
                sort: { createdAt: -1 }
              },
              populate: [
                {
                  path: 'replyToComment',
                  select: 'user',
                  populate: [
                    {
                      path: 'user',
                      select: 'username job'
                    }
                  ]
                },
                {
                  path: 'user',
                  select: '_id username job avatar',
                  populate: {
                    path: 'avatar',
                    select: '_id secureURL'
                  }
                }
              ]
            }
          ]
        }),
      Post.aggregate([
        {
          $match: {
            _id: mongoose.Types.ObjectId(postId),
          },
        },
        {
          $project: {
            comments: { $size: '$comments' },
          }
        }
      ])
    ]);

    if (!post) {
      throw Boom.badRequest('Not found post');
    }

    return res
      .status(200)
      .json({
        status: 200,
        metadata: Utils.post.getmetadata(_page, _limit, counter[0].comments),
        data: comments
      });

  } catch (error) {
    return next(error);
  }
};

