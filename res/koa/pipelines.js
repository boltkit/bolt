const moment = require("moment")

class IndexController {

  constructor({koa, bull, mongoose}) {
    this.bull = bull;
    this.mongoose = mongoose;
    koa.useRouter(koa.router
      .get('/pipelines', this.showPipelineInstances.bind(this))
      .get('/pipelines/:id', this.showPipelineInstance.bind(this))
      .get('/pipelines/:id/job/:jobid', this.showJobInstance.bind(this))
      .get('/pipelines/:id/rollback/:jobid', this.showRollbackInstance.bind(this))
      .get('/pipeline/process', this.processPipeline.bind(this))
      .post('/pipelines', this.createPipeline.bind(this))
    );
  }

  async showPipelineInstances(ctx, next) {
    const pipelines = await this.mongoose.models.PipelineInstance.find({}, null, {sort: { createdAt: -1 }});
    const scripts = await this.mongoose.models.PipelineScript.find({}, null, {sort: { createdAt: -1 }});
    await ctx.render('pipelines', {pipelines, scripts, moment})
  }

  async showJobInstance(ctx, next) {
    const pipeline = await this.mongoose.models.PipelineInstance.findOne({_id: ctx.params.id});
    const job = pipeline.jobs[ctx.params.jobid];
    await ctx.render('job', {pipeline, job, moment})
  }

  async showRollbackInstance(ctx, next) {
    const pipeline = await this.mongoose.models.PipelineInstance.findOne({_id: ctx.params.id});
    const job = pipeline.jobs[ctx.params.jobid];
    await ctx.render('rollback', {pipeline, job, moment})
  }

  async showPipelineInstance(ctx, next) {
    const pipeline = await this.mongoose.models.PipelineInstance.findOne({_id: ctx.params.id});
    await ctx.render('pipeline', {pipeline, moment})
  }

  /**
   * Creates
   */
  async createPipeline(ctx, next) {
    const scriptId = ctx.request.body.scriptId;
    const script = await this.mongoose.models.PipelineScript.findOne({_id: scriptId});
    if (script) {
      console.log("creating pipeline with script:")
      //console.log(script.srcYml)
      const pipeline = new this.mongoose.models.PipelineInstance(Object.assign(
        {},
        script.srcObject,
        {
          scriptId: scriptId,
          scriptVersion: script.lastVersionCount,
          scriptName: script.name
        }
      ));
      await pipeline.save();
      //ctx.body = `Pipeline id: ${pipeline.id}`
      ctx.redirect(`/pipelines/${pipeline.id}`)
    } else {
      ctx.body = "Failed to create"
    }
  }

  async processPipeline(ctx, next) {
    let repeatableJobs = await this.bull.getQueue('pipeline-scheduler').getRepeatableJobs();
    console.log(`${repeatableJobs.length} running jobs for pipelines`)
    this.bull
    .getQueue('pipeline-scheduler')
    .add({}, {repeat: {every: 1*1000}, attempts: 1, timeout: 5*60*1000});


    repeatableJobs = await this.bull.getQueue('rollback-scheduler').getRepeatableJobs();
    console.log(`${repeatableJobs.length} running jobs for rollback`)
    this.bull
    .getQueue('rollback-scheduler')
    .add({}, {repeat: {every: 1*1000}, attempts: 1, timeout: 5*60*1000});

    ctx.body = `launched jobs`  
  
  }
}

module.exports = IndexController;
