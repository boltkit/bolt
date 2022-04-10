const spawn = require('child_process').spawn;
const asyncjs = require('async');
const path = require('path');
const os = require('os');
const fs = require('fs');
const {v4: uuidv4} = require('uuid');

module.exports = ({mongoose}) => {

  mongoose.schemas.ProcInstance = mongoose.mongoose.Schema({
    isStarted: { type: Boolean, index: true, default: false },
    isFinished: { type: Boolean, index: true, default: false },
    bin: { type: String, index: false, required: true },
    opts: { type: [String], index: false, required: true },
    env: { type: {}, index: false, default: {} },
    cwd: { type: String, index: false, default: '.' },
    messages: { type: [String], index: false, default: [] },
    stdout: { type: String, default: '' },
    stderr: { type: String, default: '' },
    err: { type: Object, default: null },
    exitCode: { type: Number, default: null },
    resultObject: { type: Object, default: null },

    // timestamps
    createdAt: { type: Date, index: true, default: Date.now },
    updatedAt: { type: Date, index: true, default: null },
    deletedAt: { type: Date, index: true, default: null }
  }, {toJSON: {virtuals: true}, toObject: {virtuals: true}});

  mongoose.schemas.ProcInstance.virtual('isFailure').get(function() {
    if (this.isFinished && (this.err || /*this.stderr ||*/ this.exitCode !== 0)) {
      return true;
    }
    return false;
  });

  mongoose.schemas.ProcInstance.virtual('isSuccess').get(function() {
    return this.isFinished && !this.isFailure;
  });
  
  mongoose.schemas.ProcInstance.virtual('status').get(function() {
    return this.isSuccess ? 'success' : (this.isFailure ? 'failure' : 'pending');
  });

  mongoose.schemas.ProcInstance.methods.saveParentPipelineInstance = function () {
    if (this.__parentPipelineInstance) this.__parentPipelineInstance.saveParallel();
  }

  mongoose.schemas.ProcInstance.methods.exec = function (_cb) {
    const that = this;
    this.isStarted = true;

    if (_cb) {
      const ls = spawn(
        this.bin,
        this.opts.concat("2>&1"),
        {
          cwd: this.cwd,
          env: Object.assign(
            {},
            process.env,
            this.env,
            {__JOB_RESULT_FILE__: this.__jobResultFile},
            (this.__runtimeEnv || {}),
            that.script.vars.reduce((obj, item) => Object.assign(obj, { [item.name]: item.value }), {})
          ),
          shell: true,
          stdio: ['inherit', 'pipe', 'pipe']
        }
      );

      ls.stdout.setEncoding('utf8');

      ls.stdout.on('data', (chunk) => {
        //console.log(chunk)
        this.stdout += chunk.toString();
        this.saveParentPipelineInstance()
      });

      ls.stderr.on('data', (chunk) => {
        //console.log(chunk)
        this.stderr += chunk.toString();
        this.saveParentPipelineInstance()
      });

      ls.on('spawn', (data) => {
        console.log("spawn /// ", this.bin, this.opts.join(" "))
      });

      ls.on('message', (data) => {
        this.messages.push(data);
      });

      ls.on('error', (err) => {
        this.err = err;
        this.isFinished = true;
        this.saveParentPipelineInstance();
        _cb(this.err, this);
      });

      ls.on('disconnect', () => {
        this.err = new Error("Process disconnected");
        this.isFinished = true;
        this.saveParentPipelineInstance();
        _cb(this.err, this);
      });

      ls.on('exit', (code) => {
        this.exitCode = code;
        try {
          this.resultObject = JSON.parse(this.stdout);
        } catch (err) {
          /*console.log("can't parse stdout")
          console.log(this.stdout)
          console.log(this.stderr)
          console.log(err)
          */
        }
        console.log("finished /// ", this.bin, this.opts.join(" "))
        this.isFinished = true;
        this.saveParentPipelineInstance();
        if (this.exitCode === 0) {
          _cb(null, this);
        } else {
          _cb(new Error("Process exited with non zero code"), this);
        }
      });

    } else {
      return new Promise((resolve, reject) => {

        const ls = spawn(
          this.bin,
          this.opts.concat("2>&1"),
          {
            cwd: this.cwd,
            env: Object.assign(
              {},
              process.env,
              this.env,
              {__JOB_RESULT_FILE__: this.__jobResultFile},
              (this.__runtimeEnv || {}),
              that.script.vars.reduce((obj, item) => Object.assign(obj, { [item.name]: item.value }), {})
            ),
            shell: true,
            stdio: ['inherit', 'pipe', 'pipe']
          }
        );

        ls.stdout.on('data', (chunk) => {
          //console.log(chunk)
          this.stdout += chunk.toString();
          this.saveParentPipelineInstance();
        });

        ls.stderr.on('data', (chunk) => {
          //console.log(chunk)
          this.stderr += chunk.toString();
          this.saveParentPipelineInstance();
        });

        ls.on('spawn', (data) => {
          //console.log('====================================    PROMISE')
          console.log("spawn /// ", this.bin, this.opts.join(" "))
        });

        ls.on('message', (data) => {
          this.messages.push(data);
        });

        ls.on('error', (err) => {
          this.err = err;
          this.isFinished = true;
          this.saveParentPipelineInstance();
          reject(this.err);
        });

        ls.on('disconnect', () => {
          this.err = new Error("Process disconnected");
          this.isFinished = true;
          this.saveParentPipelineInstance();
          reject(this.err);
        });

        ls.on('exit', (code) => {
          this.exitCode = code;
          try {
            this.resultObject = JSON.parse(this.stdout);
          } catch (err) {
            /*
            console.log("can't parse stdout")
            console.log(this.stdout)
            console.log(this.stderr)
            console.log(err)
            */
          }
          console.log("finished /// ", this.bin, this.opts.join(" "))
          this.isFinished = true;
          this.saveParentPipelineInstance()
          if (this.exitCode === 0) {
            resolve(this);
          } else {
            reject(new Error("Process exited with non zero code"));
          }
          
        });

      });
    }
  }



  /**
   * Job
   */
  mongoose.schemas.JobInstance = mongoose.mongoose.Schema({
    name: { type: String, index: false, required: true },
    procs: { type: [mongoose.schemas.ProcInstance], required: true },
    rollbacks: { type: [mongoose.schemas.ProcInstance], required: true },

    // if one of these is true, 
    isFinished: { type: Boolean, index: true, default: false },
    isRunning: { type: Boolean, index: true, default: false },
    //isCanceled: { type: Boolean, index: true, default: false },

    // rollback
    isRollbackFinished: { type: Boolean, index: true, default: false },
    isRollbackRunning: { type: Boolean, index: true, default: false },

    // result
    resultBuffer: { type: Buffer, index: false, default: null },
    rollbackResultBuffer: { type: Buffer, index: false, default: null },

    // timestamps
    createdAt: { type: Date, index: true, default: Date.now },
    updatedAt: { type: Date, index: true, default: null },
    deletedAt: { type: Date, index: true, default: null }
  }, {toJSON: {virtuals: true}, toObject: {virtuals: true}});


  /**
   * Populates job's children subcommands with:
   * - `cwd` is temporary shared working directory for each command in this job
   * - `__jobResultFile` is the file where current job should write job result
   * - `__runtimeEnv` is an object containing env variables with results of each job (read from job result files)
   * - `__parentPipelineInstance` is parent pipeline instance object
   *
   * This is intended to be used just before executing our first command in the job
   *
   * @param {String} way - indicates if we populate before running 'forward' or 'rollback' 
   */
  mongoose.schemas.JobInstance.methods.populateChildCommands = function(way) {
    const that = this;

    // set command collection name
    let cmdattr = null;
    if (way === 'forward') cmdattr = 'procs';
    else if (way === 'backward') cmdattr = 'rollbacks';
    else throw Error(`JobInstance.populateChildCommands wrong param way ${way}`);

    // create and set working directory
    const cwd = fs.mkdtempSync(os.tmpdir()+path.sep);
    that[cmdattr].forEach(p => p.cwd = cwd);

    // create and set tmp folder for job results
    const jobResultDir = fs.mkdtempSync(os.tmpdir()+path.sep);
    const jobResultFile = jobResultDir + path.sep + '__JOB_RESULT_FILE__';
    that[cmdattr].forEach(p => p.__jobResultFile = jobResultFile);

    // create previous job result files
    const ppResultDir = fs.mkdtempSync(os.tmpdir()+path.sep);
    try {
      if (that.__jobResultsAsBuffer) {
        let ii = 0;
        let runtimeEnv = {};
        for (let jobres of that.__jobResultsAsBuffer) {
          runtimeEnv[`__JOB_${ii}_RESULT_FILE__`] = ppResultDir + path.sep + `__JOB_${ii}_RESULT_FILE__`;
          //console.log(runtimeEnv[`__JOB_${ii}_RESULT_FILE__`], jobres)
          fs.writeFileSync(runtimeEnv[`__JOB_${ii}_RESULT_FILE__`], jobres || "");
          console.log(`wrote job result for job ${that.name} #${that._id}`);
          //console.log(fs.readFileSync(runtimeEnv[`__JOB_${ii}_RESULT_FILE__`]))
          ii++;
        }
        // add env to procs
        that[cmdattr].forEach(el => el.__runtimeEnv = runtimeEnv);
      }

      // add parent pipeline instance
      that[cmdattr].forEach(el => {
        el.__lastParentPipelineSave = 0;
        el.__parentPipelineInstance = that.__parentPipelineInstance
      });

      // add related script ID
      that[cmdattr].forEach(el => {
        el.__scriptId = that.__scriptId;
      });

    } catch (err2) {
      console.log("err2", err2)
    }

    return {jobResultDir, jobResultFile};
  };

  /**
   * Execute forward commands for this job
   */
  mongoose.schemas.JobInstance.methods.execSeries = function(_cb) {
    const that = this;
    const {jobResultFile} = this.populateChildCommands('forward');
    
    return mongoose.models.PipelineScript.findOne({_id: that.__scriptId})
    .then((script) => {

      // add related script
      that.procs.forEach(el => {
        el.script = script;
      });

      return new Promise((resolve, reject) => {
        asyncjs.series(that.procs.map(el => el.exec.bind(el)),
        function (err, values) {
          try {
            that.resultBuffer = fs.readFileSync(jobResultFile);
          } catch (err2) {
            console.log(`no result provided by job ${that.name} #${that._id}`)
          }
          if (err) {
            reject(err);
          } else {
            resolve(that);
          }
        });
      });
    });
  };



  /**
   * Executes rollback commands for this job
   */
  mongoose.schemas.JobInstance.methods.execRollbackSeries = function(_cb) {
    const that = this;
    const {jobResultFile} = this.populateChildCommands('backward');

    return mongoose.models.PipelineScript.findOne({_id: that.__scriptId})
    .then((script) => {

      // add related script
      that.rollbacks.forEach(el => {
        el.script = script;
      });

      return new Promise((resolve, reject) => {
        asyncjs.series(that.rollbacks.map(el => el.exec.bind(el)),
        function (err, values) {
          try {
            that.rollbackResultBuffer = fs.readFileSync(jobResultFile);
          } catch (err2) {
            console.log(`no result provided by rollback job ${that.name} #${that._id}`)
          }
          if (err) {
            reject(err);
          } else {
            resolve(that);
          }
        });
      });
    });
  };

  mongoose.schemas.JobInstance.virtual('isFailure').get(function(_cb) {
    return this.procs.filter(el => el.isFailure).length > 0;
  });

  mongoose.schemas.JobInstance.virtual('isSuccess').get(function(_cb) {
    return !this.isFailure;
  });

  mongoose.schemas.JobInstance.virtual('resultString').get(function(_cb) {
    return this.resultBuffer.toString();
  });

  mongoose.schemas.JobInstance.virtual('isRollbackFailure').get(function(_cb) {
    return this.rollbacks.filter(el => el.isFailure).length > 0;
  });

  mongoose.schemas.JobInstance.virtual('isRollbackSuccess').get(function(_cb) {
    return !this.isRollbackFailure;
  });

  mongoose.schemas.JobInstance.virtual('rollbackResultString').get(function(_cb) {
    return this.rollbackResultBuffer.toString();
  });

  mongoose.schemas.JobInstance.methods.getRollbackStatus = function(_cb) {
    if (this.isRollbackFinished) {
      if (this.isRollbackFailure) {
        return 'failure';
      } else if (this.isRollbackSuccess) {
        return 'success';
      }
      return 'unknown';
    } else if (this.isRollbackRunning) {
      return 'running';
    } else if (this.isRollbackCanceled) {
      return 'canceled';
    } else {
      return 'pending';
    }
  }
  

  mongoose.schemas.JobInstance.methods.getStatus = function(_cb) {
    if (this.isFinished) {
      if (this.isFailure) {
        return 'failure';
      } else if (this.isSuccess) {
        return 'success';
      }
      return 'unknown';
    } else if (this.isRunning) {
      return 'running';
    } else if (this.isCanceled) {
      return 'canceled';
    } else {
      return 'pending';
    }
  }


  /**
   * Pipeline
   */
  mongoose.schemas.PipelineInstance = mongoose.mongoose.Schema({
    // if one of these is true, we don't touch the pipeline
    isLocked: { type: Boolean, index: true, default: false },
    // run state
    isFinished: { type: Boolean, index: true, default: false },
    isRunning: { type: Boolean, index: true, default: false },
    // rollback state
    isRollbackNeeded: { type: Boolean, index: true, default: false },
    //forceRollback: { type: Boolean, index: true, default: false }, // for manual rollback even if pipeline succeeded
    isRollbackFinished: { type: Boolean, index: true, default: false },
    isRollbackRunning: { type: Boolean, index: true, default: false },

    scriptId: {type: mongoose.mongoose.Types.ObjectId, index: true, default: null},
    scriptVersion: {type: Number, index: true, default: 0},
    scriptName: {type: String, index: false, default: ""},

    // local id of current job [0-X]
    currentJobId: { type: Number, index: true, default: 0 },
    // job states, including stdout, exit codes, etc...
    jobs: { type: [mongoose.schemas.JobInstance], index: true, required: true },

    // timestamps
    createdAt: { type: Date, index: true, default: Date.now },
    updatedAt: { type: Date, index: true, default: null },
    deletedAt: { type: Date, index: true, default: null }
  }, {toJSON: {virtuals: true}, toObject: {virtuals: true}});


  /**
   * Delayed save function... it will wait until at least one second elapsed before saving
   * It will also record
   */
  mongoose.schemas.PipelineInstance.methods.saveParallel = function(delayed) {
    this.__lastParallelSave = typeof(this.__lastParallelSave) === 'undefined' ? 0 : this.__lastParallelSave;
    this.__saveRequestCount = typeof(this.__saveRequestCount) === 'undefined' ? 0 : this.__saveRequestCount;


    if (delayed === true) {
      if (this.__saveRequestCount === 0 && (Date.now() - this.__lastParallelSave) >= 1000) {
        this.__lastParallelSave = Date.now();
        this.save()
        .then(() => {
          console.log(`pipeline instance saves ${this.name} #${this._id}`)
        })
        .catch((err) => {
          console.log(`pipeline instance save ERROR ${this.name} #${this._id}`, err)
        })
      } else {
        this.__saveRequestCount = 0;
        setTimeout(() => {
          this.saveParallel(true);
        }, 1100);
      }
    } else {
      this.__saveRequestCount = 0;
      setTimeout(() => {
        this.saveParallel(true);
      }, 1100);
    }

  }

  /**
   * Get job id (0-n) from which we can start running rollback
   */
  mongoose.schemas.PipelineInstance.methods.getRollbackEntryPoint = function() {
    let i = 0;
    for (let job of this.jobs) {
      if (job.isFailure) {
        return i;
      }
      i++;
    }
    return this.jobs.length - 1;
  }

  mongoose.schemas.PipelineInstance.methods.getRollbackJob = function() {
    if (this.isRollbackNeeded) {
      let i = this.getRollbackEntryPoint();
      const jobResultsAsBuffer = this.jobs.map(el => el.resultBuffer);
      while (i >= 0) {
        const job = this.jobs[i];
        if (!job.isRollbackFinished && !job.isRollbackRunning) {
          job.__jobResultsAsBuffer = jobResultsAsBuffer;
          job.__parentPipelineInstance = this;
          job.__scriptId = this.scriptId;
          return job;
        }
        i--;
      }
    }
    return null;
  }
  
  mongoose.schemas.PipelineInstance.methods.getNextJob = function() {
    let i = 0;
    let jobResultsAsBuffer = [];
    for (job of this.jobs) {
      jobResultsAsBuffer[i] = job.resultBuffer;
      // we stop processing next jobs if previous failed
      if (job.isFailure) {
        //while (i < this.jobs.length) this.jobs[i].isCanceled = true;
        return null;
      }
      if (!job.isFinished && !job.isRunning) {
        job.__jobResultsAsBuffer = jobResultsAsBuffer;
        job.__parentPipelineInstance = this;
        job.__scriptId = this.scriptId;
        return job;
      }
      i++;
    }
    return null;
  }

  /*
  mongoose.schemas.PipelineInstance.methods.isRollbackNeeded = function() {
    if (this.forceRollback === true) {
      return true;
    }
    for (let job of this.jobs) {
      if (job.isFailure) {
        return true;
      }
    }
    return false;
  }
  */

  mongoose.schemas.PipelineInstance.virtual('isFailure').get(function(_cb) {
    return this.jobs.filter(el => el.isFailure).length > 0;
  });

  mongoose.schemas.PipelineInstance.virtual('isSuccess').get(function(_cb) {
    return !this.isFailure;
  });

  mongoose.schemas.PipelineInstance.methods.getStatus = function() {
    if (this.isFinished) {
      if (this.isSuccess) {
        return "success";
      } else if (this.isFailure) {
        return "failure";
      }
      return "unknown";
    } else if (this.isRunning) {
      return "running";
    } else {
      return "pending";
    }
  }
  
  mongoose.schemas.PipelineInstance.virtual('isRollbackFailure').get(function(_cb) {
    return this.jobs.filter(el => el.isRollbackFailure).length > 0;
  });

  mongoose.schemas.PipelineInstance.virtual('isRollbackSuccess').get(function(_cb) {
    return !this.isRollbackFailure;
  });

  mongoose.schemas.PipelineInstance.methods.getRollbackStatus = function() {
    if (this.isRollbackFinished) {
      if (this.isRollbackSuccess) {
        return "success";
      } else if (this.isRollbackFailure) {
        return "failure";
      }
      return "unknown";
    } else if (this.isRollbackRunning) {
      return "running";
    } else {
      return "pending";
    }
  }

  mongoose.schemas.PipelineInstance.methods.debug = function(_cb) {

    console.log(`pipeline #${this.id}`);
    let i = 1;
    this.jobs.forEach(job => {
      job.debug();
      i++;
    });
  }
  
  mongoose.models.PipelineInstance = mongoose.mongoose.model('PipelineInstance', mongoose.schemas.PipelineInstance);
};



