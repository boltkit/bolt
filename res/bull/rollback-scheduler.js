/**
 * The role of a job scheduler is to look for incomplete pipelines, waiting to be executed
 * To be specific, it will look inside unfinished pipelines, those, where no jobs are running
 */
module.exports = ({bull, logger, mongoose}) => bull.worker('rollback-scheduler', async (job) => {

  logger.info(`looking for pipelines needing for a rollback`);

  const pipeline = await mongoose.models.PipelineInstance
  .findOne({
    isLocked: false,
    isRunning: false,
    isFinished: true,
    isRollbackNeeded: true,
    isRollbackRunning: false,
    isRollbackFinished: false
  }).exec();
  if (pipeline) {
    logger.info(`Found pipeline to rollback ${pipeline.id}`);
    
    // start pipeline
    pipeline.isRollbackRunning = true;
    await pipeline.save()
    
    // check which job to start next
    console.log("======================================GET ROLLBACK JOB start")
    const job = pipeline.getRollbackJob()
    console.log("======================================GET ROLLBACK JOB", job)
    if (job) {

      console.log(`next job found: ${job.name}`);

      job.isRollbackRunning = true;
      //await job.save({suppressWarning: true});
      await pipeline.save()
      console.log(`job ${job.name} marked as running`);

      try {
        await job.execRollbackSeries();
        //job.isRollbackSuccess = true;
        console.log(`job ${job.name} succeeded`);
      } catch (err) {
        //job.isRollbackFailure = true;
        console.log(`job ${job.name} failed ${err.message}`);
      }
      job.isRollbackRunning = false;
      job.isRollbackFinished = true;
      //await job.save();
      await pipeline.save()
      console.log(`job ${job.name} saved`);

      //
      // Update pipeline
      //

      // Pipeline not running anymore
      pipeline.isRollbackRunning = false;

      // Update pipeline is no more job left
      if (!pipeline.getRollbackJob()) {
        pipeline.isRollbackFinished = true;
        // @todo: move this to virtual methods
        /*if (job.isFailure) {
          pipeline.isFailure = true;
        } else {
          pipeline.isSuccess = true;
        }*/
      }
      await pipeline.save();
    } else {
      // No job found this pipeline is finished
      pipeline.isRollbackFinished = true;
      pipeline.isRollbackRunning = false;
      await pipeline.save()
    }
  } else {
    logger.info("NO pipelines to process");
  }

  return Promise.resolve(true);
});
