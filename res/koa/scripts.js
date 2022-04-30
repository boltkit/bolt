const moment = require("moment")
const ajv = require("ajv");
const yaml = require('js-yaml');
const jsf = require('json-schema-faker');

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
      .get('/scripts/:id/vars', this.getScriptVars.bind(this))
      .post('/scripts/:id/vars', this.setScriptVars.bind(this))
      .get('/scripts/:id/pipelines', this.showScriptPipelines.bind(this))
    );
  }

  async showScripts(ctx, next) {
    const scripts = await this.mongoose.models.PipelineScript.find({}, null, {sort: { createdAt: -1 }});
    await ctx.render('scripts', {scripts, moment})
  }

  async showScript(ctx, next) {
    const script = this.mongoose.mongoose.Types.ObjectId.isValid(ctx.params.id) ? await this.mongoose.models.PipelineScript.findOne({_id: ctx.params.id}) : await this.mongoose.models.PipelineScript.findOne({slug: ctx.params.id});
    await ctx.render('script', {script, moment, yaml, jsf});
  }

  async newScript(ctx, next) {
    await ctx.render('script-new', {});
  }

  async editScript(ctx, next) {
    const script = this.mongoose.mongoose.Types.ObjectId.isValid(ctx.params.id) ? await this.mongoose.models.PipelineScript.findOne({_id: ctx.params.id}) : await this.mongoose.models.PipelineScript.findOne({slug: ctx.params.id});
    await ctx.render('script-edit', {script, moment});
  }

  async getScriptVars(ctx, next) {
    const script = this.mongoose.mongoose.Types.ObjectId.isValid(ctx.params.id) ? await this.mongoose.models.PipelineScript.findOne({_id: ctx.params.id}) : await this.mongoose.models.PipelineScript.findOne({slug: ctx.params.id});
    await ctx.render('script-vars', {script, moment});
  }

  async setScriptVars(ctx, next) {
    const script = this.mongoose.mongoose.Types.ObjectId.isValid(ctx.params.id) ? await this.mongoose.models.PipelineScript.findOne({_id: ctx.params.id}) : await this.mongoose.models.PipelineScript.findOne({slug: ctx.params.id});
    if (ctx.request.body.vars_name && ctx.request.body.vars_value &&
        Array.isArray(ctx.request.body.vars_name) && Array.isArray(ctx.request.body.vars_value) &&
        ctx.request.body.vars_name.length === ctx.request.body.vars_value.length)
    {
      const vars_name = ctx.request.body.vars_name;
      const vars_value = ctx.request.body.vars_value;
      let vars = [];
      for (let i in vars_name) {
        if (vars_name[i] && vars_value[i]) {
          vars.push({
            name: vars_name[i],
            value: vars_value[i],
            hidden: false
          });
        }
      }
      console.log(vars);
      script.vars = vars;
      await script.save();
    }
    await ctx.render('script-vars', {script, moment});
  }

  async showScriptPipelines(ctx, next) {
    const script = this.mongoose.mongoose.Types.ObjectId.isValid(ctx.params.id) ? await this.mongoose.models.PipelineScript.findOne({_id: ctx.params.id}) : await this.mongoose.models.PipelineScript.findOne({slug: ctx.params.id});
    const pipelines = await this.mongoose.models.PipelineInstance.find({scriptId: script.id}, null, {sort: { createdAt: -1 }});
    await ctx.render('script-pipelines', {script, pipelines, moment});
  }

  async createScriptVersion(ctx, next) {
    const script = this.mongoose.mongoose.Types.ObjectId.isValid(ctx.params.id) ? await this.mongoose.models.PipelineScript.findOne({_id: ctx.params.id}) : await this.mongoose.models.PipelineScript.findOne({slug: ctx.params.id});
    script.versions.push(ctx.params.src);
    await script.save();
    await ctx.status(200).json({msg: "done"});
  }

  /**
   * Creates script to be run as pipeline
   */
  async createScript(ctx, next) {
    console.log(ctx.request.body)
    const ajvInstance = new ajv({useDefaults: true});
    const validateSource = ajvInstance.compile({
      type: "object",
      properties: {
        args: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: {type: "string", pattern: "^BOLT_ARG_[a-zA-Z0-9]+$", minLength: ("BOLT_ARG_".length + 2), maxLength: ("BOLT_ARG_".length + 100)},
              schema: {type: "object", default: {type: "string"}}
            },
            required: ["name"]
          }
        },
        beforeJob: {
          type: "object",
          properties: {
            // pipeine wide env variables
            env: {
              type: "object"
            },
            // run processes
            script: {
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
                },
                required: ["bin"],
                additionalProperties: false
              }
            },
            // rollback processes
            rollback: {
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
                },
                required: ["bin"],
                additionalProperties: false
              }
            }
          },
          required: ["script"],
          additionalProperties: false
        },
        afterJob: {
          type: "object",
          properties: {
            // run processes
            script: {
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
                },
                required: ["bin"],
                additionalProperties: false
              }
            },
            // rollback processes
            rollback: {
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
                },
                required: ["bin"],
                additionalProperties: false
              }
            }
          },
          required: ["script"],
          additionalProperties: false
        },
        jobs: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: {type: "string"},
              // run processes
              script: {
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
                  },
                  required: ["bin"],
                  additionalProperties: false
                }
              },
              // rollback processes
              rollback: {
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
                  },
                  required: ["bin"],
                  additionalProperties: false
                }
              }
            },
            required: ["name", "script"],
            additionalProperties: false
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
            if (ctx.request.body.slug &&
                typeof(ctx.request.body.slug) === "string" &&
                ctx.request.body.slug.trim().length > 0 &&
                /^[a-zA-Z0-9_-]+$/.test(ctx.request.body.slug) &&
                script.slug !== ctx.request.body.slug) {
              script.slug = ctx.request.body.slug; 
            }
            script.description = ctx.request.body.description;
            script.versions.push({src});
            await script.save();
            ctx.redirect(`/scripts/${script.slug || script.id}`); 
          } else {
            throw Error(`Script not found ${ctx.request.body.id}`);
          }
        } else {
          let _newobj = {
            name: ctx.request.body.name,
            description: ctx.request.body.description || "",
            versions: [
              {
                src: src
              }
            ]
          };
          if (ctx.request.body.slug &&
              typeof(ctx.request.body.slug) === "string" &&
              ctx.request.body.slug.trim().length > 0 &&
              /^[a-zA-Z0-9_-]+$/.test(ctx.request.body.slug)) {
            _newobj.slug = ctx.request.body.slug; 
          }
          const script = new this.mongoose.models.PipelineScript(_newobj);
          await script.save();
          ctx.redirect(`/scripts/${script.slug || script.id}`);
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
