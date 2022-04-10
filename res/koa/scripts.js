const moment = require("moment")
const ajv = require("ajv");
const yaml = require('js-yaml');

class IndexController {

  constructor({koa, bull, mongoose}) {
    this.bull = bull;
    this.mongoose = mongoose;
    koa.useRouter(koa.router
      .get('/scripts', this.showScripts.bind(this))
      .get('/scripts/new', this.newScript.bind(this))
      .post('/scripts', this.createScript.bind(this))
      .get('/scripts/:id', this.showScript.bind(this))
      .post('/scripts/:id', this.createScriptVersion.bind(this))
      .get('/scripts/:id/edit', this.editScript.bind(this))
      .get('/scripts/:id/vars', this.varsScript.bind(this))
      .get('/scripts/:id/pipelines', this.pipelinesScript.bind(this))
    );
  }

  async showScripts(ctx, next) {
    const scripts = await this.mongoose.models.PipelineScript.find({}, null, {sort: { createdAt: -1 }});
    await ctx.render('scripts', {scripts, moment})
  }

  async showScript(ctx, next) {
    const script = await this.mongoose.models.PipelineScript.findOne({_id: ctx.params.id});
    await ctx.render('script', {script, moment});
  }

  async newScript(ctx, next) {
    await ctx.render('script-new', {});
  }

  async editScript(ctx, next) {
    const script = await this.mongoose.models.PipelineScript.findOne({_id: ctx.params.id});
    await ctx.render('script-edit', {script, moment});
  }

  async varsScript(ctx, next) {
    const script = await this.mongoose.models.PipelineScript.findOne({_id: ctx.params.id});
    await ctx.render('script-vars', {script, moment});
  }

  async pipelinesScript(ctx, next) {
    const script = await this.mongoose.models.PipelineScript.findOne({_id: ctx.params.id});
    const pipelines = await this.mongoose.models.PipelineInstance.find({scriptId: ctx.params.id});
    await ctx.render('script-pipelines', {script, pipelines, moment});
  }

  async createScriptVersion(ctx, next) {
    const script = await this.mongoose.models.PipelineScript.findOne({_id: ctx.params.id});
    script.versions.push(ctx.params.src);
    await script.save();
    await ctx.status(200).json({msg: "done"});
  }

  /**
   * Creates script to be run as pipeline
   */
  async createScript(ctx, next) {
    console.log(ctx.request.body)
    const ajvInstance = new ajv();
    const validateSource = ajvInstance.compile({
      type: "object",
      properties: {
        jobs: {type: "array"},
        items: {
          type: "object",
          properties: {
            name: {type: "string"},
            // run processes
            procs: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  bin: {type: "string"},
                  opts: {
                    type: "array",
                    items: {type: "string"}
                  },
                  env: {type: "object"}
                }
              }
            },
            // rollback processes
            rollbacks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  bin: {type: "string"},
                  opts: {
                    type: "array",
                    items: {type: "string"}
                  },
                  env: {type: "object"}
                }
              }
            }
          }
        }
      },
      required: ["jobs"],
      additionalProperties: false
    });

    try {
      const src = yaml.load(ctx.request.body.src);
      if (validateSource(src)) {
        if (ctx.request.body.id) {
          const script = await this.mongoose.models.PipelineScript.findOne({_id: ctx.request.body.id});
          if (script) {
            script.name = ctx.request.body.name;
            script.description = ctx.request.body.description;
            script.versions.push({src});
            await script.save();
            ctx.redirect(`/scripts/${script.id}`); 
          } else {
            throw Error(`Script not found ${ctx.request.body.id}`);
          }
        } else {
          const script = new this.mongoose.models.PipelineScript({
            name: ctx.request.body.name,
            description: ctx.request.body.description || "",
            versions: [
              {
                src: src
              }
            ]
          });
          await script.save();
          ctx.redirect(`/scripts/${script.id}`);
        }
      } else {
        console.error(validateSource.errors)
        throw Error("Invalid format"+validateSource.errors)
      }
    } catch (err) {
      ctx.body = err.message;
    }
  }
}

module.exports = IndexController;
