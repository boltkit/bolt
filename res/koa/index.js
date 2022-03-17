const moment = require("moment")

class IndexController {

  constructor({koa, bull, mongoose}) {
    this.name = 'Koa';
    this.bull = bull;
    this.mongoose = mongoose;
    koa.useRouter(koa.router
      .get('/', this.index.bind(this))
    );
  }

  async index(ctx, next) {
    const pipelines = await this.mongoose.models.PipelineInstance.find({}, null, {sort: { createdAt: -1 }});
    const scripts = await this.mongoose.models.PipelineScript.find({}, null, {sort: { createdAt: -1 }});
    await ctx.render('index', {pipelines, scripts, moment})
  }
}

module.exports = IndexController;
