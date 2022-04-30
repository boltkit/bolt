const yaml = require('js-yaml');

module.exports = ({mongoose}) => {

  mongoose.schemas.PipelineVariable = mongoose.mongoose.Schema({
    name: { type: String, index: false, required: true },
    value: { type: String, index: false, required: true },
    hidden: { type: Boolean, index: false, default: false }
  }, {toJSON: {virtuals: true}, toObject: {virtuals: true}});

  mongoose.schemas.PipelineScriptVersion = mongoose.mongoose.Schema({
    src: { type: Object, index: false, required: true },
  }, {toJSON: {virtuals: true}, toObject: {virtuals: true}});

  /**
   * Returns last version source object
   */
  mongoose.schemas.PipelineScriptVersion.virtual('srcObject').get(function() {
    return this.src;
  });

  /**
   * Returns last version source json
   */
  mongoose.schemas.PipelineScriptVersion.virtual('srcJson').get(function() {
    return JSON.stringify(this.src);
  });

  /**
   * Returns last version source yaml
   */
  mongoose.schemas.PipelineScriptVersion.virtual('srcYml').get(function() {
    return yaml.dump(this.src);
  });


  mongoose.schemas.PipelineScript = mongoose.mongoose.Schema({
    name: { type: String, index: false, required: false },
    description: { type: String, index: false, required: false },
    slug: { type: String, index: { unique: true, partialFilterExpression: { slug: { $type: "string" } } } },
    versions: { type: [mongoose.schemas.PipelineScriptVersion], default: [] },

    // variables and possible arguments
    vars: { type: [mongoose.schemas.PipelineVariable], default: [] },

    // timestamps
    createdAt: { type: Date, index: true, default: Date.now },
    updatedAt: { type: Date, index: true, default: null },
    deletedAt: { type: Date, index: true, default: null }
  }, {toJSON: {virtuals: true}, toObject: {virtuals: true}});

  /**
   * Returns last version object
   */
  mongoose.schemas.PipelineScript.virtual('lastVersion').get(function() {
    return this.versions[this.versions.length - 1];
  });

  /**
   * Returns last version id
   */
  mongoose.schemas.PipelineScript.virtual('lastVersionCount').get(function() {
    return this.versions.length - 1;
  });

  /**
   * Returns last version arguments object
   */
  mongoose.schemas.PipelineScript.virtual('args').get(function() {
    return this.lastVersion.src.args;
  });

  mongoose.schemas.PipelineScript.methods.getArgByName = function(name) {
    const args = this.args.filter(el => el.name === name);
    if (args.length === 1) {
      return args[0];
    }
    return null;
  };

  /**
   * Returns last version source object
   */
  mongoose.schemas.PipelineScript.virtual('srcObject').get(function() {
    return this.lastVersion.src;
  });

  /**
   * Returns last version source object, compiled to be executed by runner
   *
   * - it prepends every job.script with beforeJob.script
   * - it appends every job.script with afterJob.script
   */
  mongoose.schemas.PipelineScript.virtual('srcObjectCompiled').get(function() {
    let src = JSON.parse(JSON.stringify(this.lastVersion.src)); // TODO: use structuredClone when reached Node 17 in production
    if (src.beforeJob) {
      // prepend script to jobs
      if (src.beforeJob.script) {
        src.jobs = src.jobs.map(job => {
          job.script = src.beforeJob.script.concat(job.script);
          return job;
        }); 
      }
      // prepend rollback to jobs
      if (src.beforeJob.rollback) {
        src.jobs = src.jobs.map(job => {
          job.rollback = src.beforeJob.rollback.concat(job.rollback || []);
          return job;
        }); 
      }
      // prepend env to jobs (script and rollback)
      if (src.beforeJob.env) {
        src.jobs = src.jobs.map(job => {
          // for scripts
          job.script = job.script.map(proc => {
            proc.env = Object.assign({}, src.beforeJob.env||{}, proc.env||{});
            return proc;
          });
          // for rollback
          job.rollback = (job.rollback || []).map(proc => {
            proc.env = Object.assign({}, src.beforeJob.env||{}, proc.env||{});
            return proc;
          });
          return job;
        }); 
      }
    }
    if (src.afterJob) {
      // append script to jobs
      if (src.afterJob.script) {
        src.jobs = src.jobs.map(job => {
          job.script = job.script.concat(src.afterJob.script);
          return job;
        });
      }
      // append rollback to jobs
      if (src.afterJob.rollback) {
        src.jobs = src.jobs.map(job => {
          job.rollback = (job.rollback || []).concat(src.afterJob.rollback);
          return job;
        });
      }
    }
    //console.log("MERGED JOBS");
    //console.log(JSON.stringify(src, null, 4))
    return src;
  });

  /**
   * Returns last version source json
   */
  mongoose.schemas.PipelineScript.virtual('srcJson').get(function() {
    return JSON.stringify(this.lastVersion.src);
  });

  /**
   * Returns last version source yaml
   */
  mongoose.schemas.PipelineScript.virtual('srcYml').get(function() {
    return yaml.dump(this.lastVersion.src);
  });

  mongoose.models.PipelineScript = mongoose.mongoose.model('PipelineScript', mongoose.schemas.PipelineScript);
};



