const express = require('express');

const redis = require("redis")

const app = express();

const port = process.env.PORT || 8000;

const redisHost = process.env.REDIS_HOST || "localhost"
const redisPort = process.env.REDIS_PORT || 6379

const redisClient = redis.createClient({
  url: `redis://${redisHost}:${redisPort}`
})

const rateLimitMaxReqs = 5
const rateLimitWindowMs = 60000

async function rateLimit(req, res, next) {
  const ip = req.ip

  let tokenBucket
  try {
    tokenBucket = await redisClient.hGetAll(ip)
  } catch (e) {
    next()
    return
  }
  tokenBucket = {
    tokens: parseFloat(tokenBucket.tokens) || rateLimitMaxReqs,
    last: parseInt(tokenBucket.last) || Date.now()
  }

  const timestamp = Date.now()
  const ellapsedTimeMs = timestamp - tokenBucket.last
  const refreshRate = rateLimitMaxReqs / rateLimitWindowMs
  tokenBucket.tokens += ellapsedTimeMs * refreshRate
  tokenBucket.tokens = Math.min(rateLimitMaxReqs, tokenBucket.tokens)
  tokenBucket.last = timestamp

  if (tokenBucket.tokens >= 1) {
    tokenBucket.tokens -= 1
    await redisClient.hSet(ip, [
      ['tokens', tokenBucket.tokens],
      ['last', tokenBucket.last]
    ])
    next()
  } else {
    res.status(429).send({
      err: "Too many requests per minute"
    })
  }
}

app.use(rateLimit)

app.get('/', (req, res) => {
  res.status(200).json({
    timestamp: new Date().toString()
  });
});

app.use('*', (req, res, next) => {
  res.status(404).json({
    err: "Path " + req.originalUrl + " does not exist"
  });
});

redisClient.connect().then(() => {
  app.listen(port, () => {
    console.log("== Server is running on port", port);
  });
})
