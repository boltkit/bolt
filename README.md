
# !!! Warning: This is a Work in progress project, only use it if you know what you do !!!
# !!! DO NOT USE IT IN PRODUCTION !!!


# Bolt kit

Bolt is a simple, lightweight, minimalist pipeline runner


# How to configure

You have an example config under `config.example/`.
You can move it under `config/` or write your own.

In both cases, **you must review configuration and change secret keys, IPs and ports** according to your environment. **Do not use example configuration in production**.


# How to run (Development Environment)

```bash

# clone this repo
git clone https://github.com/boltkit/bolt.git && cd ./bolt

# make sure you have your `config` folder, check `config.example/`

# start http server (http://localhost:3000)
./http.sh

# start worker
./worker.sh

# the very first time, start scheduled jobs
curl http://localhost:3000/pipeline/process

```


# How to run (Production Environment)

```bash

# install latest version globally
NO_PROMPT=y npm i -g @boltkit/bolt

# make sure you have your `config` folder, check `config.example/`

# http server
bolt-http

# workers
bolt-worker

# the very first time, start scheduled jobs
curl http://localhost:3000/pipeline/process

```


### Git clone example (public)

Each job is started inside a tmp folder, so you can use that for temporaty storage like cloning a git reposity

```yaml
jobs:
  - name: Git clone example
    script:
      - env:
          no_proxy: '*'
        bin: git
        opts:
          - clone
          - '--progress'
          - https://github.com/koajs/koa.git
          - .
```

### Docker pull example (with rollback)


```yaml
jobs:
  - name: Docker pull example (with rollback)
    script:
      - bin: docker
        opts:
          - pull
          - alpine
    rollback:
      - bin: docker
        opts:
          - rm
          - image
          - alpine
```

### Simple file persistance example

All commands executed inside the same job run in same tmp directory


```yaml
jobs:
  - name: Simple file persistance example
    script:
      - bin: echo
        opts:
          - test
          - ">>"
          - __test.txt
      - bin: cat
        opts:
          - __test.txt
```


### Job result storage example

Each job can persist a result in `$__JOB_RESULT_FILE__`, then bolt will pick it up and store in mongodb 

Warning: do not use this to store large data, only few bytes, like an id or a small json document

You can also use special `$__JOB_***_RESULT_FILE__` variables to access previous pipeline jobs results from other jobs, see example below

This is very useful when you have to create multiple dependent resources with randomly generates IDs


```yaml
jobs:
  - name: Simple job result storage example
    script:
      - bin: curl
        opts:
          - "--insecure"
          - https://random-data-api.com/api/color/random_color
          - "|"
          - jq
          - ".color_name"
          - ">"
          - $__JOB_RESULT_FILE__
```



### Job results example

You can access job results by using `$__JOB_0_RESULT_FILE__` variables

For example if you have 3 jobs you will have 3 variables: `__JOB_0_RESULT_FILE__`, `__JOB_1_RESULT_FILE__` and `__JOB_2_RESULT_FILE__`


```yaml
jobs:
  - name: Get color 0
    script:
      - bin: curl
        opts:
          - "--insecure"
          - https://random-data-api.com/api/color/random_color
          - "|"
          - jq
          - ".color_name"
          - ">"
          - $__JOB_RESULT_FILE__
  - name: Get color 1
    script:
      - bin: curl
        opts:
          - "--insecure"
          - https://random-data-api.com/api/color/random_color
          - "|"
          - jq
          - ".color_name"
          - ">"
          - $__JOB_RESULT_FILE__
  - name: Get color 2
    script:
      - bin: curl
        opts:
          - "--insecure"
          - https://random-data-api.com/api/color/random_color
          - "|"
          - jq
          - ".color_name"
          - ">"
          - $__JOB_RESULT_FILE__
  - name: Show colors
    script:
      - bin: cat
        opts:
          - $__JOB_0_RESULT_FILE__
          - $__JOB_1_RESULT_FILE__
          - $__JOB_2_RESULT_FILE__
```


### Simple rollback example


```yaml
jobs:
  - name: First Working Job
    script:
      - bin: ls
        opts: []
    rollback:
      - bin: echo
        opts:
          - nothing to rollback
  - name: Second Working Job
    script:
      - bin: ls
        opts: []
    rollback:
      - bin: echo
        opts:
          - rolling back second job
  - name: Third Failing Job
    script:
      - bin: echo
        opts:
          - i will try to run unexisting binary and fail
      - bin: binarythatdoesnotexist
        opts: []
    rollback:
      - bin: echo
        opts:
          - rolling back 3rd job
```


### Args passing example

```yaml
args:
  - name: BOLT_ARG_STRING
    schema:
      type: string
  - name: BOLT_ARG_ARRAY
    schema:
      type: array
  - name: BOLT_ARG_OBJECT
    schema:
      type: object
      properties:
        bin:
          type: string
        opts:
          type: array
          items:
            type: string
        env:
          type: array
      required:
        - bin
        - opts
        - env
      additionalProperties: false
jobs:
  - name: Show args
    script:
      - bin: echo
        opts:
          - $BOLT_ARG_STRING
          - '|'
          - jq
      - bin: echo
        opts:
          - $BOLT_ARG_ARRAY
          - '|'
          - jq
      - bin: echo
        opts:
          - $BOLT_ARG_OBJECT
          - '|'
          - jq
```



### Before Job scripts

Use before_job to repeat some action before every job in your pipeline.
Most of the time you will be using it to authenticate against some service.
It is important to understand that beforeJob is not yet another job, it will be prepended to whatever commands you already have in your jobs instead.

Aso note that you can set pipeline wide env variables using `beforeJob.env`. Environment variables will be injected just before script specific environment vars

```yaml
beforeJob:
  env:
    TEST_VAR: 'TEST_VAR from beforeJob'
  script:
    - bin: docker
      opts:
        - pull
        - alpine
jobs:
  - name: Get release
    script:
      - bin: docker
        opts:
          - run
          - alpine
          - cat
          - /etc/os-release
  - name: Show global env
    script:
      - bin: echo
        opts:
          - $TEST_VAR
```


### Before Job scripts 2

Same thing works for rollback scripts

```yaml
beforeJob:
  env:
    TEST_VAR: 'TEST_VAR from beforeJob'
  script:
    - bin: docker
      opts:
        - pull
        - alpine
  rollback:
    - bin: echo
      opts:
        - rollback before hook
jobs:
  - name: Get release
    script:
      - bin: docker
        opts:
          - run
          - alpine
          - cat
          - /etc/os-release
  - name: Fail job on purpose
    script:
      - bin: binary_that_does_not_exist
```


### After Job test

Same thing works for afterJob to append script / rollback

```yaml
beforeJob:
  env:
    TEST_VAR: 'TEST_VAR from beforeJob'
  script:
    - bin: echo
      opts:
        - script before hook
  rollback:
    - bin: echo
      opts:
        - rollback before hook
afterJob:
  script:
    - bin: echo
      opts:
        - script after hook
  rollback:
    - bin: echo
      opts:
        - rollback after hook
jobs:
  - name: Get release
    script:
      - bin: echo
        opts: ["dummy job"]
  - name: Fail job on purpose
    script:
      - bin: binary_that_does_not_exist
```





### Todo:

- [v] implement rollback
- [v] store job results
- [v] read job results from other jobs and rollback jobs
- [v] improve UI
- [v] update scripts feature
- [v] handle script vars
- [v] rename "script/rollback" in config/database
- [v] implement pipeline args
- [v] script slugs
- [v] before/after job hooks
- [v] implement repeat pipeline
- manage job timeout
- secure inputs
- implement auth
- implement api
- add BOLT_ARG_***_RAW that strips quotes from json strings
- BOLT_ARG_ shall have _ allowed in it
- PUBLIC_URL config to be able to render curl request correctly and such
- being able to reuse config fro other config files {{ CONFIG.filename.someAttibute }}
- implement projects and project level environments
- implement optional hidden/clear variable switch
- think about configuration store
- vault integration

