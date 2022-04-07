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

  mongoose.schemas.ProcInstance.methods.exec = function (_cb) {
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
            (this.__runtimeEnv || {})
          ),
          shell: true,
          stdio: ['inherit', 'pipe', 'pipe']
        }
      );

      ls.stdout.setEncoding('utf8');

      ls.stdout.on('data', (chunk) => {
        console.log(chunk)
        this.stdout += chunk.toString();
      });

      ls.stderr.on('data', (chunk) => {
        console.log(chunk)
        this.stderr += chunk.toString();
      });

      ls.on('spawn', (data) => {
        console.log('====================================')
        console.log("spawn", this.bin, this.opts.join(" "))
      });

      ls.on('message', (data) => {
        this.messages.push(data);
      });

      ls.on('error', (err) => {
        this.err = err;
        this.isFinished = true;
        _cb(this.err, this);
      });

      ls.on('disconnect', () => {
        this.err = new Error("Process disconnected");
        this.isFinished = true;
        _cb(this.err, this);
      });

      ls.on('exit', (code) => {
        this.exitCode = code;
        try {
          this.resultObject = JSON.parse(this.stdout);
        } catch (err) {
          console.log("can't parse stdout")
          console.log(this.stdout)
          console.log(this.stderr)
          console.log(err)
        }
        console.log("IS FINISHED")
        this.isFinished = true;
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
              (this.__runtimeEnv || {})
            ),
            shell: true,
            stdio: ['inherit', 'pipe', 'pipe']
          }
        );

        ls.stdout.on('data', (chunk) => {
          console.log(chunk)
          this.stdout += chunk.toString();
        });

        ls.stderr.on('data', (chunk) => {
          console.log(chunk)
          this.stderr += chunk.toString();
        });

        ls.on('spawn', (data) => {
          console.log('====================================')
          console.log("spawn", this.bin, this.opts.join(" "))
        });

        ls.on('message', (data) => {
          this.messages.push(data);
        });

        ls.on('error', (err) => {
          this.err = err;
          this.isFinished = true;
          reject(this.err);
        });

        ls.on('disconnect', () => {
          this.err = new Error("Process disconnected");
          this.isFinished = true;
          reject(this.err);
        });

        ls.on('exit', (code) => {
          this.exitCode = code;
          try {
            this.resultObject = JSON.parse(this.stdout);
          } catch (err) {
            console.log("can't parse stdout")
            console.log(this.stdout)
            console.log(this.stderr)
            console.log(err)
          }
          console.log("IS FINISHED")
          this.isFinished = true;
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


  mongoose.schemas.JobInstance.methods.execRollbackSeries = function(_cb) {
    const that = this;

    // create and set working directory
    const cwd = fs.mkdtempSync(os.tmpdir()+path.sep);
    that.rollbacks.forEach(p => p.cwd = cwd);

    // create and set tmp folder for job results
    const jobResultDir = fs.mkdtempSync(os.tmpdir()+path.sep);
    const jobResultFile = jobResultDir + path.sep + '__JOB_RESULT_FILE__';
    that.rollbacks.forEach(p => p.__jobResultFile = jobResultFile);

    // create previous job result files
    const ppResultDir = fs.mkdtempSync(os.tmpdir()+path.sep);
    try {
      if (that.__jobResultsAsBuffer) {
        let ii = 0;
        let runtimeEnv = {};
        for (let jobres of that.__jobResultsAsBuffer) {
          runtimeEnv[`__JOB_${ii}_RESULT_FILE__`] = ppResultDir + path.sep + `__JOB_${ii}_RESULT_FILE__`;
          //console.log(runtimeEnv[`__JOB_${ii}_RESULT_FILE__`], jobres)
          fs.writeFileSync(runtimeEnv[`__JOB_${ii}_RESULT_FILE__`], jobres||"");
          ii++;
        }
        // add env to rollback
        that.rollbacks.forEach(el => el.__runtimeEnv = runtimeEnv);
      }
    } catch (err2) {
      console.log("err2", err2)
    }
    
    if (_cb) {
      asyncjs.series(that.rollbacks.map(el => el.exec.bind(el)),
      function (err, values) {
        try {
          that.rollbackResultBuffer = fs.readFileSync(jobResultFile);
        } catch (err2) {
          console.log("err2", err2)
        }
        if (err) {
          _cb(err, that);
        } else {
          _cb(null, that);
        }
      });
    } else {
      return new Promise((resolve, reject) => {
        asyncjs.series(that.rollbacks.map(el => el.exec.bind(el)),
        function (err, values) {
          try {
            that.rollbackResultBuffer = fs.readFileSync(jobResultFile);
          } catch (err2) {
            console.log("err2", err2)
          }
          if (err) {
            reject(err);
          } else {
            resolve(that);
          }
        });
      });
    }
  }


  mongoose.schemas.JobInstance.methods.execSeries = function(_cb) {
    const that = this;

    // create and set working directory
    const cwd = fs.mkdtempSync(os.tmpdir()+path.sep);
    that.procs.forEach(p => p.cwd = cwd);

    // create and set tmp folder for job results
    const jobResultDir = fs.mkdtempSync(os.tmpdir()+path.sep);
    const jobResultFile = jobResultDir + path.sep + '__JOB_RESULT_FILE__';
    that.procs.forEach(p => p.__jobResultFile = jobResultFile);

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
          ii++;
        }
        // add env to procs
        that.procs.forEach(el => el.__runtimeEnv = runtimeEnv);
      }
    } catch (err2) {
      console.log("err2", err2)
    }
    
    if (_cb) {
      asyncjs.series(that.procs.map(el => el.exec.bind(el)),
      function (err, values) {
        try {
          that.resultBuffer = fs.readFileSync(jobResultFile);
        } catch (err2) {
          console.log("err2", err2)
        }
        if (err) {
          _cb(err, that);
        } else {
          _cb(null, that);
        }
      });
    } else {
      return new Promise((resolve, reject) => {
        asyncjs.series(that.procs.map(el => el.exec.bind(el)),
        function (err, values) {
          try {
            that.resultBuffer = fs.readFileSync(jobResultFile);
          } catch (err2) {
            console.log("err2", err2)
          }
          if (err) {
            reject(err);
          } else {
            resolve(that);
          }
        });
      });
    }
  }

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
      //console.log("=============getRollbackEntryPoint", i, i >= 0)
      while (i >= 0) {
        //console.log("=============while", i, this.jobs[i])
        const job = this.jobs[i];
        //console.log("============= isRollbackFinished isRollbackRunning", job.isRollbackFinished, job.isRollbackRunning)
        if (!job.isRollbackFinished && !job.isRollbackRunning) {
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
      //console.log(this)
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



