const moment = require("moment")
const ajv = require("ajv");
const yaml = require('js-yaml');

class IndexController {

  constructor({koa, bull, mongoose}) {
    this.bull = bull;
    this.mongoose = mongoose;
    koa.useRouter(koa.router
      .get('/scripts', this.showScripts.bind(this))
      .post('/scripts', this.createScript.bind(this))
      .get('/scripts/:id', this.showScript.bind(this))
      .post('/scripts/:id', this.createScriptVersion.bind(this))
    );
  }

  async showScripts(ctx, next) {
    const scripts = await this.mongoose.models.PipelineScript.find({}, null, {sort: { createdAt: -1 }});
    await ctx.render('scripts', {scripts, moment})
  }

  async showScript(ctx, next) {
    const script = await this.mongoose.models.PipelineScript.findOne({_id: ctx.params.id});
    await ctx.render('script', {script, moment})
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
    const ajvInstance = new ajv();
    const validateSource = ajvInstance.compile({
      type: "object",
      properties: {
        jobs: {type: "array"},
        items: {
          type: "object",
          properties: {
            name: {type: "string"},
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
            }
          }
        }
      },
      required: ["jobs"],
      additionalProperties: false
    });

    try {
      console.log(ctx.request.body.src)
      const src = yaml.load(ctx.request.body.src);
      if (validateSource(src)) {
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
        //ctx.body = `pipeline script: ${script.id}`
        ctx.redirect(`/scripts/${script.id}`)
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
