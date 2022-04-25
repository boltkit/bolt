const moment = require("moment")
const ajv = require("ajv");
const yaml = require('js-yaml');

class IndexController {

  constructor({koa, bull, mongoose}) {
    this.bull = bull;
    this.mongoose = mongoose;
    koa.useRouter(koa.router
      .get('/api/v1/scripts', this.listScripts.bind(this))
      .get('/api/v1/scripts/:id', this.getScript.bind(this))
      .get('/api/v1/scripts/:id/pipelines', this.listScriptPipelines.bind(this))
      .put('/api/v1/scripts/:id/pipelines', this.spawnScriptPipeline.bind(this))
    );
  }

  async listScripts(ctx, next) {
    const scripts = await this.mongoose.models.PipelineScript.find({}, null, {sort: { createdAt: -1 }});
    ctx.response.status = 200;
    ctx.response.body = {
      scripts: scripts.map(script => ({
        id: script.id,
        name: script.name,
        description: script.description,
        //lastVersion: script.lastVersion,
        createdAt: script.createdAt,
        updatedAt: script.updatedAt,
        deletedAt: script.deletedAt
      }))
    };
  }

  async getScript(ctx, next) {
    const script = await this.mongoose.models.PipelineScript.findOne({_id: ctx.params.id});
    ctx.response.status = 200;
    ctx.response.body = {
      script: {
        id: script.id,
        name: script.name,
        description: script.description,
        //lastVersion: script.lastVersion,
        createdAt: script.createdAt,
        updatedAt: script.updatedAt,
        deletedAt: script.deletedAt
      }
    };
  }

  async listScriptPipelines(ctx, next) {
    const script = await this.mongoose.models.PipelineScript.findOne({_id: ctx.params.id});
    const pipelines = await this.mongoose.models.PipelineInstance.find({scriptId: ctx.params.id}, null, {sort: { createdAt: -1 }});
    ctx.response.status = 200;
    ctx.response.body = {
      script: {
        id: script.id,
        name: script.name,
        description: script.description,
        //lastVersion: script.lastVersion,
        createdAt: script.createdAt,
        updatedAt: script.updatedAt,
        deletedAt: script.deletedAt
      },
      pipelines
    };
  }

  async spawnScriptPipeline(ctx, next) {
    const ajvi = new ajv();
    const scriptId = ctx.params.id;
    const script = await this.mongoose.models.PipelineScript.findById(scriptId);
    
    if (script) {
      let args = [];
      // check args
      if (script.args) {
        // build args
        for (let arg of script.args) {
          // validate schema
          if (!ajvi.validate(arg.schema, ctx.request.body[arg.name])) {
            ctx.response.status = 400;
            ctx.response.body = {
              msg: `${arg.name} argument does not match schema`
            }
            return;
          }
          // else argument is valid, we add it
          args.push({
            name: arg.name,
            schema: arg.schema,
            value: ctx.request.body[arg.name]
          });
        }
      }

      const pipeline = new this.mongoose.models.PipelineInstance(Object.assign(
        {},
        script.srcObject,
        {
          scriptId: scriptId,
          scriptVersion: script.lastVersionCount,
          scriptName: script.name,
          args: args
        }
      ));
      await pipeline.save();
      ctx.response.status = 200;
      ctx.response.body = {
        pipeine: {
          id: pipeline.id
        }
      };
    } else {
      ctx.response.status = 404;
      ctx.response.body = {
        msg: `Script ${scriptId} not found`
      };
    }
  }
}

module.exports = IndexController;
