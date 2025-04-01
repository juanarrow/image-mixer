import { Injectable, NgZone } from '@angular/core';
import * as ort from 'onnxruntime-web';
import { env } from 'onnxruntime-web';
import { Tensor, TypedTensor } from 'onnxruntime-web';

// Comprobar si el entorno es compatible con multithreading
const isThreadingEnabled = (): boolean => {
  try {
    return window.crossOriginIsolated;
  } catch (e) {
    return false;
  }
};

// Configurar ONNX según las capacidades del navegador
if (isThreadingEnabled()) {
  console.log('Entorno aislado detectado. Habilitando multithreading WebAssembly.');
  env.wasm.numThreads = Math.min(navigator.hardwareConcurrency || 4, 4);
} else {
  console.log('Entorno no aislado. Usando WebAssembly sin hilos.');
  env.wasm.numThreads = 1;
}

env.wasm.wasmPaths = {
  wasm: '/assets/wasm/ort-wasm-simd-threaded.wasm',
  mjs: '/assets/wasm/ort-wasm-simd-threaded.mjs',
};

@Injectable({
  providedIn: 'root'
})
export class OnnxService {
  private session1: ort.InferenceSession | null = null; // Shinkai
  private session2: ort.InferenceSession | null = null; // Hayao
  private readonly shinkai = 'assets/models/Shinkai.onnx';
  private readonly hayao = 'assets/models/Hayao.onnx';
  private isInitialized = false;
  
  constructor(private zone: NgZone) {
    // Configurar el backend al inicializar el servicio
    this.initOnnxRuntime();
  }
  
  private async initOnnxRuntime() {
    try {
      console.log('Configurando ONNX Runtime para usar WebAssembly');
      
      // Opciones optimizadas sólo para WebAssembly sin WebGL
      const options: ort.InferenceSession.SessionOptions = {
        executionProviders: ['wasm'],  // Usar sólo WebAssembly
        graphOptimizationLevel: 'all' as const,
        enableCpuMemArena: true
      };
      
      this.isInitialized = true;
      return options;
    } catch (error) {
      console.error('Error al inicializar ONNX Runtime:', error);
      return {};
    }
  }

  async loadModel(modelUrl: string): Promise<void> {
    try {
      // Cargar el modelo como ArrayBuffer
      const response = await fetch(modelUrl);
      const modelBuffer = await response.arrayBuffer();
      const modelData = new Uint8Array(modelBuffer);
      
      const options: ort.InferenceSession.SessionOptions = {
        executionProviders:['wasm'],
        graphOptimizationLevel: 'all',
        enableCpuMemArena: true
      };
      
      // Pasar el buffer del modelo en lugar de la URL
      this.session1 = await ort.InferenceSession.create(modelData, options);
    } catch (error) {
      console.error('Error al cargar el modelo ONNX 1:', error);
      this.session1 = null;
    }
  }

  async loadModel2(modelUrl: string): Promise<void> {
    try {
      // Similar al loadModel pero para session2
      const response = await fetch(modelUrl);
      const modelBuffer = await response.arrayBuffer();
      const modelData = new Uint8Array(modelBuffer);
      
      const options: ort.InferenceSession.SessionOptions = {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
        enableCpuMemArena: true
      };
      
      this.session2 = await ort.InferenceSession.create(modelData, options);
    } catch (error) {
      console.error('Error al cargar el modelo ONNX 2:', error);
      this.session2 = null;
    }
  }

  // Verificar soporte de WebGL
  private async checkWebGLSupport(): Promise<boolean> {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || 
                 canvas.getContext('webgl') || 
                 canvas.getContext('experimental-webgl');
      
      return !!gl;
    } catch (e) {
      console.warn('Error al verificar soporte WebGL:', e);
      return false;
    }
  }

  async runInference(inputData: Float32Array): Promise<ort.Tensor | null> {
    if (!this.session1) {
      console.error('La sesión del modelo 1 no está cargada.');
      return null;
    }

    try {
      const tensor = new ort.Tensor('float32', inputData, [1, 3, 512, 512]);
      const feeds = { 'images': tensor };

      const output = await this.session1.run(feeds);
      const outputTensor = output[Object.keys(output)[0]];
      return outputTensor;
    } catch (error) {
      console.error('Error durante la inferencia:', error);
      return null;
    }
  }

  async runInference2(tensor: ort.Tensor): Promise<ort.Tensor | null> {
    if (!this.session1) {
      console.error('La sesión del modelo 1 no está cargada.');
      return null;
    }

    try {
      const inputName = this.session1.inputNames[0];
      const feeds: { [key: string]: ort.Tensor } = {};
      feeds[inputName] = tensor;

      const output = await this.session1.run(feeds);
      const outputTensor = output[this.session1.outputNames[0]];
      return outputTensor;
    } catch (error) {
      console.error('Error durante la inferencia:', error);
      return null;
    }
  }

  async runInference2WithModel2(tensor: ort.Tensor): Promise<ort.Tensor | null> {
    if (!this.session2) {
      console.error('La sesión del modelo 2 no está cargada.');
      return null;
    }
    
    try {
      const inputName = this.session2.inputNames[0];
      const feeds: { [key: string]: ort.Tensor } = {};
      feeds[inputName] = tensor;
      
      const output = await this.session2.run(feeds);
      const outputTensor = output[this.session2.outputNames[0]];
      return outputTensor;
    } catch (error) {
      console.error('Error durante la inferencia con modelo 2:', error);
      return null;
    }
  }

  // Método genérico para cargar cualquier modelo ONNX
  async loadModelGeneric(modelUrl: string, modelType: 'shinkai' | 'hayao'): Promise<void> {
    try {
      const response = await fetch(modelUrl);
      const modelBuffer = await response.arrayBuffer();
      const modelData = new Uint8Array(modelBuffer);
      
      const hasWebGL = await this.checkWebGLSupport();
      
      const options: ort.InferenceSession.SessionOptions = {
        executionProviders: hasWebGL ? ['webgl', 'wasm'] : ['wasm'],
        graphOptimizationLevel: 'all',
        enableCpuMemArena: true
      };
      
      // Asignar a la sesión correspondiente
      if (modelType === 'shinkai') {
        this.session1 = await ort.InferenceSession.create(modelData, options);
      } else {
        this.session2 = await ort.InferenceSession.create(modelData, options);
      }
      
      console.log(`Modelo ${modelType} cargado correctamente`);
    } catch (error) {
      console.error(`Error al cargar el modelo ${modelType}:`, error);
      if (modelType === 'shinkai') this.session1 = null;
      else this.session2 = null;
    }
  }

  async processImage(image: HTMLImageElement | string, model: 'shinkai' | 'hayao'): Promise<string> {
    // Ejecutar procesamiento intensivo fuera de la zona de Angular para mejor rendimiento
    return this.zone.runOutsideAngular(async () => {
      try {
        // Asegurar que ONNX Runtime esté inicializado
        if (!this.isInitialized) {
          await this.initOnnxRuntime();
        }
        
        // Convertir la imagen a un elemento de imagen si es una URL
        let imgElement: HTMLImageElement;
        if (typeof image === 'string') {
          imgElement = await this.loadImageFromUrl(image);
        } else {
          imgElement = image;
        }
        
        // Preprocesar la imagen a un tensor
        const tensor = this.imageToTensor(imgElement);
        
        // Seleccionar el modelo y la sesión
        const session = model === 'shinkai' ? 
          (this.session1 || await this.loadSessionIfNeeded(this.shinkai, 'shinkai')) : 
          (this.session2 || await this.loadSessionIfNeeded(this.hayao, 'hayao'));
        
        if (!session) {
          throw new Error(`No se pudo cargar el modelo ${model}`);
        }
        
        // Ejecutar la inferencia
        const feeds = { 'input': tensor };
        const results = await session.run(feeds);
        const outputTensor = results[session.outputNames[0]];
        
        // Convertir el tensor de salida a una imagen
        const processedDataUrl = this.tensorToImageUrl(outputTensor);
        
        return processedDataUrl;
      } catch (error) {
        console.error(`Error procesando imagen con modelo ${model}:`, error);
        // En caso de error, devolver la imagen original
        if (typeof image === 'string') {
          return image;
        } else {
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(image, 0, 0);
          return canvas.toDataURL('image/jpeg');
        }
      }
    });
  }

  // Métodos auxiliares necesarios
  private async loadImageFromUrl(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  private async loadSessionIfNeeded(modelPath: string, type: 'shinkai' | 'hayao'): Promise<ort.InferenceSession | null> {
    try {
      const response = await fetch(modelPath);
      const modelBuffer = await response.arrayBuffer();
      const modelData = new Uint8Array(modelBuffer);
      
      // Forzar WebAssembly sin intentar WebGL
      const options: ort.InferenceSession.SessionOptions = {
        executionProviders: ['wasm'],  // Sólo WebAssembly
        graphOptimizationLevel: 'all' as const
      };
      
      console.log(`Creando sesión para modelo ${type} usando WebAssembly`);
      const session = await ort.InferenceSession.create(modelData, options);
      
      if (type === 'shinkai') {
        this.session1 = session;
      } else {
        this.session2 = session;
      }
      return session;
    } catch (error) {
      console.error(`Error cargando sesión ${type}:`, error);
      return null;
    }
  }

  private imageToTensor(img: HTMLImageElement): ort.Tensor {
    // Crear un canvas para procesar la imagen
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // Redimensionar a 512x512 (tamaño esperado por los modelos)
    canvas.width = 512;
    canvas.height = 512;
    
    // Dibujar la imagen en el canvas
    ctx!.drawImage(img, 0, 0, canvas.width, canvas.height);
    
    // Obtener los datos de la imagen
    const imageData = ctx!.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = imageData;
    
    // Convertir a tensor de forma [1, 3, 512, 512] con valores normalizados
    const tensor = new Float32Array(1 * 3 * 512 * 512);
    
    // Normalizar y reorganizar canales BGR (los modelos AnimeGANv2 esperan BGR)
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const pixelIndex = (y * canvas.width + x) * 4;
        
        // Índices en el tensor para cada canal (en formato NCHW)
        const redIdx = y * canvas.width + x;
        const greenIdx = redIdx + canvas.width * canvas.height;
        const blueIdx = greenIdx + canvas.width * canvas.height;
        
        // Normalizar a [-1, 1] y cambiar de RGB a BGR
        tensor[blueIdx] = (data[pixelIndex] / 127.5) - 1;     // R -> B
        tensor[greenIdx] = (data[pixelIndex + 1] / 127.5) - 1; // G
        tensor[redIdx] = (data[pixelIndex + 2] / 127.5) - 1;   // B -> R
      }
    }
    
    return new ort.Tensor('float32', tensor, [1, 3, 512, 512]);
  }

  private tensorToImageUrl(tensor: ort.Tensor): string {
    // Obtener dimensiones y datos del tensor
    const dims = tensor.dims;
    const width = dims[3];
    const height = dims[2];
    const floatData = tensor.data as Float32Array;
    
    // Crear canvas para la imagen de salida
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    // Crear ImageData para dibujar en el canvas
    const imageData = ctx!.createImageData(width, height);
    const data = imageData.data;
    
    // Convertir tensor a datos de imagen (convertir de BGR a RGB)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixelIndex = (y * width + x) * 4;
        
        // Índices en el tensor para cada canal (formato NCHW)
        const redIdx = y * width + x;
        const greenIdx = redIdx + width * height;
        const blueIdx = greenIdx + width * height;
        
        // Desnormalizar de [-1, 1] a [0, 255] y cambiar de BGR a RGB
        data[pixelIndex] = Math.max(0, Math.min(255, ((floatData[redIdx] + 1) * 127.5))); // B -> R
        data[pixelIndex + 1] = Math.max(0, Math.min(255, ((floatData[greenIdx] + 1) * 127.5))); // G
        data[pixelIndex + 2] = Math.max(0, Math.min(255, ((floatData[blueIdx] + 1) * 127.5))); // R -> B
        data[pixelIndex + 3] = 255; // Alpha
      }
    }
    
    // Dibujar los datos de la imagen en el canvas
    ctx!.putImageData(imageData, 0, 0);
    
    // Devolver como URL de datos
    return canvas.toDataURL('image/jpeg', 0.95);
  }
}
