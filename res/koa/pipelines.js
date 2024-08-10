const moment = require("moment")
const ajv = require("ajv");

class IndexController {

  constructor({koa, bull, mongoose, koaAuthn}) {
    this.bull = bull;
    this.mongoose = mongoose;
    koa.useRouter(koa.router
      .use(koaAuthn.requireUser())
      .get('/pipelines', this.showPipelineInstances.bind(this))
      .get('/pipelines/:id', this.showPipelineInstance.bind(this))
      .post('/pipelines/:id/repeat', this.repeatPipelineInstance.bind(this))
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
    const script = await this.mongoose.models.PipelineScript.findOne({_id: pipeline.scriptId});
    const job = pipeline.jobs[ctx.params.jobid];
    await ctx.render('job', {script, pipeline, job, moment})
  }

  async showRollbackInstance(ctx, next) {
    const pipeline = await this.mongoose.models.PipelineInstance.findOne({_id: ctx.params.id});
    const script = await this.mongoose.models.PipelineScript.findOne({_id: pipeline.scriptId});
    const job = pipeline.jobs[ctx.params.jobid];
    await ctx.render('rollback', {script, pipeline, job, moment})
  }

  async showPipelineInstance(ctx, next) {
    const pipeline = await this.mongoose.models.PipelineInstance.findOne({_id: ctx.params.id});
    const script = await this.mongoose.models.PipelineScript.findOne({_id: pipeline.scriptId});
    await ctx.render('pipeline', {script, pipeline, moment})
  }

  /**
   * Creates
   */
  async createPipeline(ctx, next) {
    const ajvi = new ajv();
    const scriptId = ctx.request.body.scriptId;
    const script = await this.mongoose.models.PipelineScript.findOne({_id: scriptId});
    if (script) {
      console.log("creating pipeline with script:")
      let args = [];
      // check args
      if (script.args) {
        // build args
        for (let arg of script.args) {
          let argValue = ctx.request.body[arg.name];
          try {
            argValue = JSON.parse(argValue);
          } catch (err) {
            //console.log(err)
          }

          // validate schema
          if (!ajvi.validate(arg.schema, argValue)) {
            ctx.body = `Bad argument value for ${arg.name}`
            return;
          }
          // else argument is valid, we add it
          args.push({
            name: arg.name,
            schema: arg.schema,
            value: argValue
          });
        }
      }

      //console.log(script.srcYml)
      const pipeline = new this.mongoose.models.PipelineInstance(Object.assign(
        {},
        script.srcObjectCompiled,
        {
          args
        },
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

  async repeatPipelineInstance(ctx, next) {
    const oldPipeline = await this.mongoose.models.PipelineInstance.findOne({_id: ctx.params.id});
    const script = await this.mongoose.models.PipelineScript.findOne({_id: oldPipeline.scriptId});

    
    const ajvi = new ajv();
    if (script && oldPipeline) {
      console.log(`repeat pipeline ${oldPipeline.id}`)
      let args = oldPipeline.args;
      const pipeline = new this.mongoose.models.PipelineInstance(Object.assign(
        {},
        script.srcObjectCompiled,
        {
          args
        },
        {
          scriptId: script.id,
          scriptVersion: script.lastVersionCount,
          scriptName: script.name
        }
      ));
      await pipeline.save();
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
