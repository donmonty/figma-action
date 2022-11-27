require('dotenv').config()
const axios = require('axios');
const PQueue = require('p-queue');
const S3 = require('aws-sdk/clients/s3');

async function run() {

  const FIGMA_FILE_URL = process.env.FIGMA_FILE_URL;
  const FIGMA_TOKEN = process.env.FIGMA_TOKEN;
  const s3AccessKeyId = process.env.AWS_S3_ACCESS_KEY;
  const s3SecretAccessKey = process.env.AWS_S3_ACCESS_SECRET;
  const s3ImagesBucketName = process.env.AWS_S3_IMAGES_BUCKET_NAME;
  const s3 = new S3({ accessKeyId: s3AccessKeyId, secretAccessKey: s3SecretAccessKey });

  const components = {};
  // const options = {
  //   format: 'jpg',
  //   outputDir: './logos',
  //   scale: '1'
  // }

  function check(c) {
    if (c.type === 'COMPONENT') {
      const { name, id } = c
      // const { description = '', key } = data.components[c.id]
      const { width, height } = c.absoluteBoundingBox
      // const filename = `${sanitize(name).toLowerCase()}.${options.format}`;

      components[id] = {
        name,
        // filename,
        id,
        // key,
        // file: fileId,
        // description,
        width,
        height
      }
    } else if (c.children) {
      // eslint-disable-next-line github/array-foreach
      c.children.forEach(check)
    }
  }

  function queueTasks(tasks, options) {
    const queue = new PQueue(Object.assign({concurrency: 3}, options))
    for (const task of tasks) {
      queue.add(() => task)
    }
    queue.start()
    return queue.onIdle()
  }

  async function uploadImage(imageUrl, imageName, contentType) {
    try {
      const response = await axios.get(imageUrl, { responseType: "arraybuffer" });
      const imageBase64 = Buffer.from(response.data, "binary").toString("base64");
      const imageBinaryBuffer = Buffer.from(imageBase64, "base64");

      const s3ImagesBucketParams = {
        ACL: "public-read",
        Body: imageBinaryBuffer,
        Bucket: s3ImagesBucketName,
        ContentEncoding: "base64",
        ContentType: `${contentType}`, // e.g. "image/png"
        Key: `${imageName}`,
      };

      s3.putObject(s3ImagesBucketParams, (err, data) => {
        if (err) {
          console.error(`S3 error with the image: ${s3ImagesBucketParams.Key} - ${err.code} : ${err.message}`);
        } else {
          console.info(`The image: ${s3ImagesBucketParams.Key} has been successfully uploaded to the bucket ${s3ImagesBucketName}`);
        }
      });

    } catch(err) {
      console.error("Error at uploadImage:", err);
    }
  }

  try {

    const response = await axios.get(
      `https://api.figma.com/v1/files/${FIGMA_FILE_URL}`,
      {
        headers: {
          "X-FIGMA-TOKEN": FIGMA_TOKEN,
        }
      }
    );
    const data = response.data;

    data.document.children.forEach(check);
    if (Object.values(components).length === 0) {
      throw Error('No components found!');
    }
    console.log(`${Object.values(components).length} components found in the Figma file`);

    // Get image URLS
    const componentIds = Object.keys(components);
    const imageUrls = await axios.get(
      `https://api.figma.com/v1/images/${FIGMA_FILE_URL}?ids=${componentIds}&format=png`,
      {
        headers: {
          "X-FIGMA-TOKEN": FIGMA_TOKEN,
        }
      }
    );
    console.log ("Image URLS: ", imageUrls.data);
    
    // Insert the image URLS into the components object
    for(const id of Object.keys(imageUrls.data.images)) {
      components[id].image = imageUrls.data.images[id]
    }

    const tasks = Object.values(components).map(async (component) => {
      return await uploadImage(component.image, component.name, "image/png");
    });

    // Upload images to S3 bucket
    queueTasks(tasks);


  } catch(err) {
    console.log("Error in run: ", err);
  }
}

run();
