const yaml = require('js-yaml');

module.exports = ({mongoose}) => {

  mongoose.schemas.PipelineVariable = mongoose.mongoose.Schema({
    name: { type: String, index: false, required: true },
    value: { type: String, index: false, required: true },
    hidden: { type: Boolean, index: false, default: false } 
  }, {toJSON: {virtuals: true}, toObject: {virtuals: true}});

  mongoose.schemas.PipelineArgument = mongoose.mongoose.Schema({
    name: { type: String, index: false, required: true },
    type: { type: String, index: false, required: true },
    defaultValue: { type: String, index: false, default: "" },
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
    versions: { type: [mongoose.schemas.PipelineScriptVersion], default: [] },

    // variables and possible arguments
    vars: { type: [mongoose.schemas.PipelineVariable], default: [] },
    //@todo
    // args: { type: [mongoose.schemas.PipelineArgument], default: [] },

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
   * Returns last version source object
   */
  mongoose.schemas.PipelineScript.virtual('srcObject').get(function() {
    return this.lastVersion.src;
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



