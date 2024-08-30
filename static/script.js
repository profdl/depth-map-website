let plane, customShaderMaterial, scene, camera, renderer, controls;
let displacementScale = 0.5; // Initial displacement scale
let currentFov = 45; // Initial FOV
let isAnimating = false; // Flag to control animation state
let textureLoader = new THREE.TextureLoader(); // Texture loader
let imageTexture, depthMapUrl; // Declare imageTexture and depthMapUrl globally

document
  .getElementById("uploadForm")
  .addEventListener("submit", async function (event) {
    event.preventDefault();

    const formData = new FormData();
    const fileField = document.querySelector('input[type="file"]');
    formData.append("image", fileField.files[0]);

    document.getElementById("loading").style.display = "block";

    const response = await fetch("/upload", {
      method: "POST",
      body: formData,
    });

    const result = await response.json();

    if (response.ok) {
      const predictionId = result.prediction_id;
      startPolling(predictionId, URL.createObjectURL(fileField.files[0]));
    } else {
      alert("Error: " + result.error);
      document.getElementById("loading").style.display = "none";
    }
  });

function startPolling(predictionId, imageUrl) {
  const intervalId = setInterval(async () => {
    const response = await fetch(`/status/${predictionId}`);
    const data = await response.json();

    if (data.status === "succeeded") {
      document.getElementById("loading").style.display = "none";
      create3DScene(imageUrl, data.output.grey_depth);
      clearInterval(intervalId);
    } else if (data.status === "failed") {
      alert("Prediction failed: " + data.error);
      document.getElementById("loading").style.display = "none";
      clearInterval(intervalId);
    }
  }, 5000); // Poll every 5 seconds
}

function create3DScene(imageUrl, depthMap) {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    currentFov,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.set(0, 0, 1); // Start camera position Z set to 1

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.getElementById("3dContainer").appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.update();

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(0, 2, 2);
  scene.add(directionalLight);

  depthMapUrl = depthMap; // Store the depth map URL for later use

  imageTexture = textureLoader.load(imageUrl, () => {
    let aspectRatio = imageTexture.image.width / imageTexture.image.height;
    createPlane(aspectRatio); // Use the global imageTexture variable
  });

  document
    .getElementById("displacementSlider")
    .addEventListener("input", function (e) {
      displacementScale = parseFloat(e.target.value);
      document.getElementById("displacementValue").innerText =
        displacementScale.toFixed(2);
      if (customShaderMaterial) {
        customShaderMaterial.uniforms.displacementScale.value =
          displacementScale;
      }
    });

  document.getElementById("fovSlider").addEventListener("input", function (e) {
    currentFov = parseFloat(e.target.value);
    document.getElementById("fovValue").innerText = currentFov;
    camera.fov = currentFov;

    // Adjust the camera distance based on FOV to maintain the plane size in the view
    const baseFov = 45; // Assume the base FOV for which initial camera position is set
    const baseDistance = 1; // Initial distance of the camera from the plane

    // Calculate new camera distance proportional to FOV change
    const newDistance =
      baseDistance *
      (Math.tan(THREE.MathUtils.degToRad(baseFov / 2)) /
        Math.tan(THREE.MathUtils.degToRad(currentFov / 2)));
    camera.position.set(0, 0, newDistance); // Update the camera position dynamically

    camera.updateProjectionMatrix();

    if (plane) {
      // Recreate the plane with the updated FOV
      createPlane(camera.aspect);
    }
  });

  document
    .getElementById("resetCameraButton")
    .addEventListener("click", function () {
      camera.position.set(0, 0, 1);
      controls.target.set(0, 0, 0);
      controls.update();
    });

  document
    .getElementById("animateButton")
    .addEventListener("click", function () {
      isAnimating = !isAnimating;
    });
}

function createPlane(aspectRatio) {
  // Remove the previous plane if it exists
  if (plane) {
    scene.remove(plane);
    plane.geometry.dispose();
    plane.material.dispose();
  }

  // Calculate base width and height using the camera's FOV and distance from the camera
  const fovRadians = THREE.MathUtils.degToRad(currentFov);
  const distanceFromCamera = camera.position.z;

  // Calculate height and width based on the FOV and aspect ratio
  const baseHeight = 2 * Math.tan(fovRadians / 2) * distanceFromCamera;
  const baseWidth = baseHeight * aspectRatio; // Width adjusted to maintain aspect ratio

  // Create plane geometry with consistent aspect ratio
  const geometry = new THREE.PlaneGeometry(baseWidth, baseHeight, 256, 256);

  const displacementMap = textureLoader.load(depthMapUrl);

  customShaderMaterial = new THREE.ShaderMaterial({
    uniforms: {
      displacementMap: { value: displacementMap },
      map: { value: imageTexture },
      displacementScale: { value: displacementScale },
    },
    vertexShader: `
      varying vec2 vUv;
      varying float vDisplacement;

      uniform sampler2D displacementMap;
      uniform float displacementScale;

      void main() {
        vUv = uv;
        vDisplacement = texture2D(displacementMap, uv).r;
        vec3 displacedPosition = position + normal * vDisplacement * displacementScale;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D map;
  
      void main() {
        vec4 color = texture2D(map, vUv);
        gl_FragColor = color;
      }
    `,
  });

  plane = new THREE.Mesh(geometry, customShaderMaterial);
  scene.add(plane);
}

window.addEventListener("resize", function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (plane) {
    createPlane(camera.aspect);
  }
});

let animateDirection = 1;
let rotationSpeed = 0.001;

function animate() {
  requestAnimationFrame(animate);

  if (isAnimating) {
    camera.position.x += animateDirection * rotationSpeed;
    if (camera.position.x > 0.1 || camera.position.x < -0.1) {
      animateDirection *= -1;
    }
    camera.lookAt(0, 0, 0);
  }

  if (controls) controls.update();
  if (renderer && scene && camera) renderer.render(scene, camera);
}
animate();
