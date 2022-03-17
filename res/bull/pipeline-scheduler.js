/**
 * The role of a job scheduler is to look for incomplete pipelines, waiting to be executed
 * To be specific, it will look inside unfinished pipelines, those, where no jobs are running
 */
module.exports = ({bull, logger, mongoose}) => bull.worker('pipeline-scheduler', async (job) => {

  logger.info(`looking for pending pipelines`);

  const pipeline = await mongoose.models.PipelineInstance
  .findOne({
    isLocked: false,
    isRunning: false,
    isFinished: false
  }).exec();
  if (pipeline) {
    logger.info(`Found pipeline to process ${pipeline.id}`);
    
    // start pipeline
    pipeline.isRunning = true;
    await pipeline.save()
    
    // check which job to start next
    const job = pipeline.getNextJob()
    if (job) {

      console.log(`next job found: ${job.name}`);

      job.isRunning = true;
      //await job.save({suppressWarning: true});
      await pipeline.save()
      console.log(`job ${job.name} marked as running`);

      try {
        await job.execSeries();
        job.isSuccess = true;
        console.log(`job ${job.name} succeeded`);
      } catch (err) {
        job.isFailure = true;
        console.log(`job ${job.name} failed ${err.message}`);
      }
      job.isRunning = false;
      job.isFinished = true;
      //await job.save();
      await pipeline.save()
      console.log(`job ${job.name} saved`);

      //
      // Update pipeline
      //

      // Pipeline not running anymore
      pipeline.isRunning = false;

      // Update pipeline is no more job left
      if (!pipeline.getNextJob()) {
        pipeline.isFinished = true;
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
      pipeline.isFinished = true;
      pipeline.isRunning = false;
      await pipeline.save()
    }
  } else {
    logger.info("NO pipelines to process");
  }

  return Promise.resolve(true);
});
