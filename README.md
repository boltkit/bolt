
**Warning: This is a Work in progress project, only use it if you know what you do**


# Bolt kit

Bolt is a simple, lightweight, minimalist pipeline runner


# How to configure

You have an example config under `config.example/`.
You can move it under `config/` or write your own.

In both cases, **you must review configuration and change secret keys, IPs and ports** according to your environment. **Do not use example configuration in production**.


# How to run

```
# start http server (http://localhost:3000)
./http.sh

# start worker
./worker.sh

# the very first time, start scheduled jobs
curl http://localhost:3000/pipeline/process

```


### Git clone example (public)

Each job is started inside a tmp folder, so you can use that for temporaty storage like cloning a git reposity

```yaml
jobs:
  - name: Git clone example
    procs:
      - env:
          no_proxy: '*'
        bin: git
        opts:
          - clone
          - '--progress'
          - https://github.com/koajs/koa.git
          - .
```

### Docker pull example


```yaml
jobs:
  - name: Docker pull example
    procs:
      - bin: docker
        opts:
          - pull
          - alpine
```

### Simple file persistance example

All commands executed inside the same job run in same tmp directory


```yaml
jobs:
  - name: Simple file persistance example
    procs:
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
    procs:
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
    procs:
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
    procs:
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
    procs:
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
    procs:
      - bin: cat
        opts:
          - $__JOB_0_RESULT_FILE__
          - $__JOB_1_RESULT_FILE__
          - $__JOB_2_RESULT_FILE__
```


### Simple rollback example


```yaml
jobs:
  - name: Docker pull example (public)
    procs:
      - bin: docker
        opts:
          - pull
          - alpine
    rollback:
      - bin: docker
        opts:
          - image
          - rm
          - alpine
```
