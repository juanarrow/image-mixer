import { Component, OnDestroy, ElementRef, ViewChild, AfterViewInit, OnInit, HostListener } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { WebcamImage, WebcamInitError, WebcamUtil } from 'ngx-webcam';
import { Subject, Observable, of, interval, Subscription } from 'rxjs';
import * as handpose from '@tensorflow-models/handpose';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-backend-cpu';
import { takeUntil, take } from 'rxjs/operators';
// Importaciones para ONNX
import * as ort from 'onnxruntime-web';
import { OnnxService } from '../services/onnx.service';
import { ImageSharingService } from '../services/image-sharing.service';

async function setupBackends() {
  try {
    // Intenta usar WebGL primero
    await tf.setBackend('webgl');
    await tf.ready();
    console.log('Using WebGL backend');
  } catch (e) {
    console.warn('WebGL backend not available, switching to CPU backend', e);
    await tf.setBackend('cpu');
    await tf.ready();
    console.log('Using CPU backend');
  }
}





@Component({
  selector: 'app-image-composer',
  templateUrl: './image-composer.component.html',
  styles: [`
    .relative.flex.justify-between {
      position: relative;
      --container-width: 0px;
    }

    @keyframes slideRight {
      0% { 
        transform: translateX(0);
        opacity: 1;
      }
      50% { 
        transform: translateX(calc(var(--container-width)/2 - 96px));
        opacity: 0.5;
      }
      100% { 
        transform: translateX(0);
        opacity: 1;
      }
    }

    @keyframes slideLeft {
      0% { 
        transform: translateX(0);
        opacity: 1;
      }
      50% { 
        transform: translateX(calc(-1 * var(--container-width)/2 + 96px));
        opacity: 0.5;
      }
      100% { 
        transform: translateX(0);
        opacity: 1;
      }
    }

    .animate-slide-right {
      animation: slideRight 1.4s ease-in-out infinite;
    }

    .animate-slide-left {
      animation: slideLeft 1.4s ease-in-out infinite;
    }
  `]
})
export class ImageComposerComponent implements OnDestroy, AfterViewInit, OnInit {
  @ViewChild('handVideo') handVideo!: ElementRef<HTMLVideoElement>;
  @ViewChild('webcam') webcam: any;  // Solo necesitamos esta referencia
  @ViewChild('handCanvas') handCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('imagesContainer') imagesContainer!: ElementRef<HTMLElement>;
  @ViewChild('webcamContainer') webcamContainer!: ElementRef<HTMLDivElement>;
  
  currentStep = 1;
  emailForm: FormGroup;
  selectedImage: File | null = null;
  selectedBackground: File | null = null;
  imagePreview: string | null = null;
  backgroundPreview: string = 'assets/imgs/bosque.jpg';
  showPreview = false;
  isMerging = false;
  isCameraReady = false;
  showPolicyModal = false;
  wantsEmail = false;
  policiesAccepted = false;

  // Variables para la webcam
  private trigger: Subject<void> = new Subject<void>();
  showWebcam = true;
  errors: WebcamInitError[] = [];
  public switchCamera: Observable<boolean> = of(true);
  public multipleWebcamsAvailable = false;

  // Opciones de la webcam
  videoOptions: MediaTrackConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 }
  };

  backgrounds = [
    { id: 1, url: 'assets/imgs/bosque.jpg', name: 'Bosque' },
    { id: 2, url: 'assets/imgs/ciudad.jpg', name: 'Ciudad' },
    { id: 3, url: 'assets/imgs/playa.jpeg', name: 'Playa' }
  ];

  handModel: any;
  isHandDetected = false;
  isModelLoaded = false;
  private webcamCheckSubscription?: Subscription;
  showCountdown = false;

  webcamWidth = 720;
  webcamHeight = 720;

  private resizeObserver: ResizeObserver;

  // Variables para ONNX
  isModelLoading1 = false;
  isModelLoading2 = false;
  resultImage1: string | null = null;
  resultImage2: string | null = null;

  // Añade estas propiedades al componente
  allowCameraSwitch = true;
  nextWebcamObservable: Observable<boolean> = of(true);

  // Variable para controlar el estado de la inicialización
  private isInitializing = false;

  

  

  // Añadir estas propiedades al componente
  qrImageUrl: string | null = null;
  showQRModal: boolean = false;
  isGeneratingQR: boolean = false;
  currentQRTitle: string = '';

  // Añadir esta propiedad
  currentUploadedUrl: string|null = '';

  // Agregar estas propiedades al componente
  selectedStyle: 'shinkai' | 'hayao' | null = null;
  styleNames = {
    'shinkai': 'Shinkai',
    'hayao': 'Hayao'
  };

  constructor(
    private fb: FormBuilder,
    private onnxService: OnnxService,
    private imageSharingService: ImageSharingService
  ) {
    this.emailForm = this.fb.group({
      email: [{ value: '', disabled: true }, [Validators.required, Validators.email]]
    });

    // Inicializar ResizeObserver
    this.resizeObserver = new ResizeObserver(() => {
      if (this.currentStep === 3) {
        this.updateContainerWidth();
      }
    });
  }

  public get triggerObservable(): Observable<void> {
    return this.trigger.asObservable();
  }

  public handleImage(webcamImage: WebcamImage): void {
    console.log('Imagen capturada:', webcamImage);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx!.scale(-1, 1);
      ctx!.translate(-img.width, 0);
      ctx!.drawImage(img, 0, 0);
      this.imagePreview = canvas.toDataURL('image/jpeg');
      this.showWebcam = false;
      this.showPreview = true;
      this.goToNextStep(); 
      // Esperar a que el DOM se actualice y luego actualizar el ancho
      setTimeout(() => {
        this.updateContainerWidth(); // Actualizar el ancho antes de iniciar la animación
        // isMerging se activará cuando el usuario presione "Continuar"
      }, 100);
    };
    
    img.src = webcamImage.imageAsDataUrl;
  }

  public triggerSnapshot(): void {
    console.log('Disparando snapshot');
    this.trigger.next();
    
  }

  public handleInitError(error: WebcamInitError): void {
    console.error('Error al inicializar la cámara:', error);
    this.errors.push(error);
  }

  public handleInitSuccess(): void {
    console.log('Cámara inicializada correctamente');
  }

  onEmailSubmit() {
    if (!this.wantsEmail || (this.wantsEmail && this.emailForm.valid)) {
      this.currentStep = 2;
      this.initWebcamDetection();
    }
  }

  ngOnInit() {
    // Actualizar tamaño inicial y en resize
    this.updateWebcamSize();
    window.addEventListener('resize', this.updateWebcamSize);
    window.addEventListener('resize', this.updateContainerWidth);

    WebcamUtil.getAvailableVideoInputs()
      .then((mediaDevices: MediaDeviceInfo[]) => {
        this.multipleWebcamsAvailable = mediaDevices && mediaDevices.length > 1;
        console.log('Dispositivos de cámara disponibles:', mediaDevices);
      });

    
  }

  ngOnDestroy() {
    // Limpiar listeners de eventos y observadores
    window.removeEventListener('resize', this.updateContainerWidth);
    window.removeEventListener('resize', this.updateWebcamDimensions);
    this.resizeObserver.disconnect();
    
    // Cancelar suscripciones
    this.webcamCheckSubscription?.unsubscribe();
    this.trigger.complete();
    
    // Liberar recursos de video
    if (this.webcam?.video?.nativeElement?.srcObject) {
      const stream = this.webcam.video.nativeElement.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
  }

  toggleEmailOption() {
    if (this.wantsEmail && !this.policiesAccepted) {
      this.showPolicyModal = true;
    } else if (!this.wantsEmail) {
      this.emailForm.get('email')?.disable();
      this.policiesAccepted = false;
    }
  }

  acceptPolicies() {
    this.policiesAccepted = true;
    this.showPolicyModal = false;
    this.emailForm.get('email')?.enable();
  }

  cancelPolicies() {
    this.wantsEmail = false;
    this.policiesAccepted = false;
    this.showPolicyModal = false;
    this.emailForm.get('email')?.disable();
  }

  async ngAfterViewInit() {
    // Cargar ambos modelos ONNX en paralelo
    this.isModelLoading1 = true;
    this.isModelLoading2 = true;
    
    try {
      // Cargar modelos en paralelo
      await Promise.all([
        this.onnxService.loadModel('assets/onnx/Shinkai_37.onnx').then(() => {
          this.isModelLoading1 = false;
          console.log('Modelo Shinkai cargado correctamente');
        }),
        this.onnxService.loadModel2('assets/onnx/Hayao_36.onnx').then(() => {
          this.isModelLoading2 = false;
          console.log('Modelo Hayao cargado correctamente');
        })
      ]);
    } catch (error) {
      console.error('Error al cargar modelos ONNX:', error);
      this.isModelLoading1 = false;
      this.isModelLoading2 = false;
    }
    
    // Cargar modelo de manos con configuración mejorada
    try {
      this.handModel = await handpose.load({
        detectionConfidence: 0.99,      // Reducir para detección más sensible
        maxContinuousChecks: 5,        // Ajustar para mejor seguimiento
        maxHands: 1,                   // Detectar solo una mano
        flipHorizontal: false,          // Necesario para webcam selfie
        scoreThreshold: 0.99           // Más tolerante en detección
      });
      
      console.log('Modelo de manos cargado correctamente');
      this.isModelLoaded = true;
      
      // Verificar si la cámara ya está lista
      if (this.isCameraReady) {
        this.startHandDetection();
      }
    } catch (error) {
      console.error('Error al cargar el modelo de manos:', error);
    }

    // Establecer el ancho del contenedor
    if (this.imagesContainer?.nativeElement) {
      this.resizeObserver.observe(this.imagesContainer.nativeElement);
      this.updateContainerWidth();
    }

    // Ajustar tamaño de webcam al cambiar tamaño de ventana
    window.addEventListener('resize', this.updateWebcamDimensions);
    
    // Ajustar tamaño inicialmente
    setTimeout(() => {
      this.setupWebcamDimensions();
    }, 300);
  }
  
  async processImages() {
    if (!this.imagePreview || !this.selectedStyle) {
      console.error('No hay imagen o estilo seleccionado');
      return;
    }

    try {
      console.log(`Procesando imagen con estilo ${this.selectedStyle}...`);
      
      // Asegurar que isMerging está activado
      this.isMerging = true;
      
      // Preparar el tensor una vez para el modelo seleccionado
      const tensor = await this.prepareImageForInference(this.imagePreview!);
      
      // Ejecutar solo el modelo seleccionado
      if (this.selectedStyle === 'shinkai') {
        // Procesar solo con modelo Shinkai
        const result = await this.processWithModel('shinkai', tensor);
        this.resultImage1 = result;
        console.log('Imagen procesada con estilo Shinkai');
        
        // Generar QR automáticamente
        this.shareWithQR(result, 'Shinkai');
      } else {
        // Procesar solo con modelo Hayao
        const result = await this.processWithModel('hayao', tensor);
        this.resultImage2 = result;
        console.log('Imagen procesada con estilo Hayao');
        
        // Generar QR automáticamente
        this.shareWithQR(result, 'Hayao');
      }
      
    } catch (error) {
      console.error('Error en procesamiento de imagen:', error);
      // Aplicar filtro simple como fallback
      this.applySimpleFilters();
      alert('Hubo un problema al procesar la imagen. Se ha aplicado un filtro simple en su lugar.');
    } finally {
      // Asegurar que isMerging se desactive en cualquier caso
      this.isMerging = false;
      console.log('Procesamiento finalizado, isMerging =', this.isMerging);
    }
  }
  
  private async processWithModel(model: 'shinkai' | 'hayao', tensor: ort.Tensor): Promise<string> {
    return new Promise(async (resolve, reject) => {
      try {
        const result = model === 'shinkai' 
          ? await this.onnxService.runInference2(tensor)
          : await this.onnxService.runInference2WithModel2(tensor);
        
        if (result) {
          resolve(this.tensorToImageUrl(result));
        } else {
          reject(new Error(`No se pudo obtener resultado para modelo ${model}`));
        }
      } catch (error) {
        reject(error);
      }
    });
  }
  
  // Método para aplicar filtros simples a ambas imágenes
  private applySimpleFilters() {
    if (!this.imagePreview) return;
    
    const img = new Image();
    img.onload = () => {
      // Filtro 1 (Shinkai - tono azul)
      const canvas1 = document.createElement('canvas');
      canvas1.width = img.width;
      canvas1.height = img.height;
      const ctx1 = canvas1.getContext('2d');
      if (ctx1) {
        ctx1.drawImage(img, 0, 0);
        ctx1.fillStyle = 'rgba(0, 102, 255, 0.2)';
        ctx1.fillRect(0, 0, canvas1.width, canvas1.height);
        this.resultImage1 = canvas1.toDataURL('image/jpeg');
      }
      
      // Filtro 2 (Hayao - tono cálido)
      const canvas2 = document.createElement('canvas');
      canvas2.width = img.width;
      canvas2.height = img.height;
      const ctx2 = canvas2.getContext('2d');
      if (ctx2) {
        ctx2.drawImage(img, 0, 0);
        ctx2.fillStyle = 'rgba(255, 204, 102, 0.3)';
        ctx2.fillRect(0, 0, canvas2.width, canvas2.height);
        this.resultImage2 = canvas2.toDataURL('image/jpeg');
      }
      
      this.isMerging = false;
    };
    
    img.src = this.imagePreview;
  }
  
  private async prepareImageForInference(imageUrl: string): Promise<ort.Tensor> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          // Redimensionar a múltiplos de 32 (mínimo 256)
          const to32s = (x: number) => x < 256 ? 256 : x - (x % 32);
          const maxSize = 1024; // Limitar tamaño máximo
          const scale = Math.min(1.0, maxSize / Math.max(img.width, img.height));
          const width = to32s(img.width * scale);
          const height = to32s(img.height * scale);
          
          // Crear un canvas y redimensionar la imagen
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error('No se pudo obtener el contexto del canvas'));
            return;
          }
          
          // Dibujar la imagen en el canvas
          ctx.drawImage(img, 0, 0, width, height);
          
          // Obtener los datos de imagen
          const imageData = ctx.getImageData(0, 0, width, height);
          
          // Convertir a formato tensor (normalizado entre -1 y 1)
          const data = new Float32Array(width * height * 3);
          let offset = 0;
          
          for (let i = 0; i < imageData.data.length; i += 4) {
            data[offset++] = imageData.data[i+2] / 127.5 - 1.0;    // R
            data[offset++] = imageData.data[i+1] / 127.5 - 1.0;  // G
            data[offset++] = imageData.data[i] / 127.5 - 1.0;  // B
          }
          
          // Crear el tensor con el formato correcto [1, 3, height, width] (NCHW)
          // Este formato es el que espera el modelo según el servicio
          const tensor = new ort.Tensor(
            'float32',
            data,
            [1, height, width, 3]  // Cambiado a formato NHWC (batch, altura, ancho, canales)
          );
          
          // Optimizar opciones de WebGL
          const env = ort.env;
          env.wasm.numThreads = navigator.hardwareConcurrency > 1 ? 
            Math.min(navigator.hardwareConcurrency - 1, 4) : 1;
          env.webgl.pack = true;
          env.webgl.textureCacheMode = 'full';
          
          resolve(tensor);
        } catch (error) {
          reject(error);
        }
      };
      
      img.onerror = (error) => {
        reject(error);
      };
      
      img.src = imageUrl;
    });
  }
  
  private tensorToImageUrl(tensor: ort.Tensor): string {
    try {
      // El tensor tiene formato [1, height, width, 3] (NHWC)
      const dims = tensor.dims;
      const height = Number(dims[1]);
      const width = Number(dims[2]);
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('No se pudo obtener el contexto del canvas');
      }
      
      const imageData = ctx.createImageData(width, height);
      const data = tensor.data as Float32Array;
      
      let pixelIndex = 0;
      
      // Recorrer datos en formato NHWC [1, height, width, 3]
      for (let h = 0; h < height; h++) {
        for (let w = 0; w < width; w++) {
          const offset = (h * width + w) * 3;
          
          // Mantener interpretación BGR
          const b = Math.max(0, Math.min(255, Math.round((data[offset] + 1) * 127.5)));
          const g = Math.max(0, Math.min(255, Math.round((data[offset + 1] + 1) * 127.5)));
          const r = Math.max(0, Math.min(255, Math.round((data[offset + 2] + 1) * 127.5)));
          
          // Asignar en orden RGB (como espera el canvas)
          imageData.data[pixelIndex++] = r;  // R
          imageData.data[pixelIndex++] = g;  // G
          imageData.data[pixelIndex++] = b;  // B
          imageData.data[pixelIndex++] = 255;
        }
      }
      
      ctx.putImageData(imageData, 0, 0);
      return canvas.toDataURL('image/jpeg');
    } catch (error) {
      console.error('Error al convertir tensor a imagen:', error);
      return '';
    }
  }

  private initWebcamDetection() {
    // Si ya estamos intentando inicializar, no hacer nada
    if (this.isInitializing) {
      console.log('Inicialización ya en progreso, ignorando solicitud');
      return;
    }
    
    this.isInitializing = true;
    console.log('Iniciando detección de webcam');
    
    // Verificar si TensorFlow está usando el backend correcto
    const currentBackend = tf.getBackend();
    console.log('Backend actual de TensorFlow:', currentBackend);
    
    // Si WebGL no está disponible, forzar el uso de CPU
    if (currentBackend !== 'webgl') {
      console.warn('WebGL no disponible, usando CPU como alternativa');
      tf.setBackend('cpu').then(() => {
        console.log('Backend cambiado a CPU');
      });
    }
    console.log('Iniciando detección de manos');
    this.startHandDetection();
    
    // Cancelar cualquier comprobación anterior
    this.webcamCheckSubscription?.unsubscribe();
    
    // Esperar a que el componente de webcam esté disponible
    this.webcamCheckSubscription = interval(300).pipe(
      take(10) // Intentar por 3 segundos máximo
    ).subscribe({
      next: () => {
        if (!this.webcam) {
          console.log('Webcam no disponible aún, reintentando...');
          return;
        }
        
        console.log('Webcam disponible, deteniendo interval');
        this.webcamCheckSubscription?.unsubscribe();
        
        // Configurar dimensiones y cargar modelos
        setTimeout(() => {
          // Actualizar dimensiones del contenedor de webcam
          this.setupWebcamDimensions();
          
        }, 500);
      },
      complete: () => {
        console.log('No se pudo encontrar el componente de webcam después de varios intentos');
        this.isInitializing = false;
        
        if (this.currentStep === 2) {
          alert('No se pudo inicializar la cámara. Por favor, recarga la página y asegúrate de conceder los permisos.');
        }
      }
    });
  }

  
  async startHandDetection() {
    if (!this.handModel || !this.webcam?.video?.nativeElement) {
      console.log('Modelo o video no disponible para detección de manos');
      setTimeout(() => {
        this.startHandDetection();
      }, 500);
      return;

    }

    try {
      const video = this.webcam.video.nativeElement;
      console.log(this.handCanvas);
      // Asegurar que el canvas tenga el tamaño correcto
      if (this.handCanvas) {
        const canvas = this.handCanvas.nativeElement;
        canvas.width = video.clientWidth || this.webcamWidth;
        canvas.height = video.clientHeight || this.webcamHeight;
        
        // Asegurar que el canvas sea transparente inicialmente
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
      
      // Colocar un log para verificar las dimensiones
      console.log('Dimensiones del video:', {
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        clientWidth: video.clientWidth,
        clientHeight: video.clientHeight
      });
      
      // Verificar que el video esté recibiendo frames
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        console.log('Dimensiones de video no válidas, reintentando...');
        setTimeout(() => this.startHandDetection(), 500);
        return;
      }
      
      // Detectar manos con opciones extendidas
      const hands = await this.handModel.estimateHands(video, {
        flipHorizontal: true
      });
      
      if (this.currentStep === 2 && !this.isHandDetected) {
        const ctx = this.handCanvas.nativeElement.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, this.webcamWidth, this.webcamHeight);
          console.log('hands', hands);
          if (hands.length > 0) {
            // Calcular escalado
            const scaleX = this.webcamWidth / video.videoWidth;
            const scaleY = this.webcamHeight / video.videoHeight;
            
            ctx.fillStyle = '#00ff00';
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 2;
            
            hands[0].landmarks.forEach((point: number[]) => {
              const x = point[0] * scaleX;
              const y = point[1] * scaleY;
              
              ctx.beginPath();
              ctx.arc(x, y, 4, 0, 2 * Math.PI);
              ctx.fill();
            });
            
            if (hands[0].annotations) {
              Object.values(hands[0].annotations).forEach((fingerPoints: any) => {
                ctx.beginPath();
                ctx.moveTo(fingerPoints[0][0] * scaleX, fingerPoints[0][1] * scaleY);
                fingerPoints.forEach((point: number[]) => {
                  ctx.lineTo(point[0] * scaleX, point[1] * scaleY);
                });
                ctx.stroke();
              });
            }

            this.isHandDetected = true;
            this.showCountdown = true;
          }
        }
        if(!this.isHandDetected)
          requestAnimationFrame(() => this.startHandDetection());
      }
    } catch (error) {
      console.error('Error en la detección de manos:', error);
      if (this.currentStep === 2 && !this.isHandDetected) {
          requestAnimationFrame(() => this.startHandDetection());
      }
    }
  }

  onCountdownFinished() {
    this.showCountdown = false;
    this.triggerSnapshot();
  }

  private updateWebcamSize = () => {
    const container = document.querySelector('.aspect-video');
    if (container) {
      const containerHeight = container.clientHeight;
      this.webcamHeight = containerHeight;
      this.webcamWidth = containerHeight * (16/9);
    }
  };

  private updateContainerWidth = () => {
    if (this.imagesContainer?.nativeElement) {
      const width = this.imagesContainer.nativeElement.clientWidth;
      this.imagesContainer.nativeElement.style.setProperty('--container-width', `${width}px`);
    }
  };

  sendEmail() {
    if (!this.resultImage1 || !this.resultImage2 || !this.wantsEmail || !this.emailForm.valid) {
      return;
    }

    const email = this.emailForm.get('email')?.value;
    console.log(`Enviando imágenes a ${email}...`);
    
    // Aquí iría la llamada a la API para enviar el email
    // Por ahora solo mostramos un mensaje de éxito en la consola
    setTimeout(() => {
      console.log('Imágenes enviadas correctamente');
      alert('Imágenes enviadas correctamente al email ' + email);
    }, 1500);
  }

  // Método de respaldo para la demostración
  simulateHandDetection() {
    console.log('Simulando detección de manos para demostración');
    this.isHandDetected = true;
    this.showCountdown = true;
  }

  // Añade este método para cargar y procesar la imagen de prueba
  private loadTestImage() {
    // Usar una imagen de prueba en lugar de la cámara
    const testImagePath = 'assets/imgs/test.png';
    
    console.log('Cargando imagen de prueba:', testImagePath);
    const img = new Image();
    
    img.onload = () => {
      // Crear un canvas para procesar la imagen
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) return;
      
      // Dibujar la imagen en el canvas
      ctx.drawImage(img, 0, 0);
      
      // Usar esta imagen como si fuera de la cámara
      this.imagePreview = canvas.toDataURL('image/jpeg');
      this.showWebcam = false;
      this.showPreview = true;
      this.currentStep = 3;
      
      // Continuar con el procesamiento normal
      setTimeout(() => {
        this.updateContainerWidth();
        this.isMerging = true;
        setTimeout(() => {
          this.processImages();
        }, 1500);
      }, 100);
    };
    
    img.onerror = (err) => {
      console.error('Error al cargar imagen de prueba:', err);
    };
    
    // Iniciar carga de la imagen
    img.src = testImagePath;
  }

  // Método para descargar imagen
  downloadImage(imageUrl: string | null, fileName: string): void {
    if (!imageUrl) {
      console.error('No hay imagen para descargar');
      return;
    }
    
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  resetImage() {
    this.imagePreview = null;
  }

  goToNextStep() {
    if(this.currentStep === 1){
      this.currentStep = 2;
      this.initWebcamDetection();
    }
    else if (this.currentStep === 2) {
      // Cuando avanzamos del paso 2 al paso 3, procesar la imagen
      this.currentStep = 3;
      
      // Iniciar el procesamiento de la imagen con el estilo seleccionado
      setTimeout(() => {
        this.isMerging = true; // Aquí activamos el spinner
        console.log('Iniciando procesamiento, isMerging =', this.isMerging);
        this.processImages();
      }, 500);
    } 
  }

  isProcessingHand: boolean = false;

  // Mejorar el método de actualización de dimensiones
  private updateWebcamDimensions = () => {
    if (!this.webcamContainer?.nativeElement) {
      console.warn('Contenedor de webcam no disponible');
      return;
    }
    
    const container = this.webcamContainer.nativeElement;
    
    // Obtener dimensiones reales del contenedor (eliminar 4px por el borde)
    const containerWidth = container.clientWidth - 4;
    const containerHeight = container.clientHeight - 4;
    
    console.log('Dimensiones reales del contenedor:', containerWidth, 'x', containerHeight);
    
    // Asegurar dimensiones mínimas y consistentes
    const minWidth = 320;
    const minHeight = 240;
    
    // Usar la relación de aspecto del contenedor
    const aspectRatio = containerWidth / containerHeight;
    
    let newWidth: number, newHeight: number;
    
    // Intentar mantener la relación de aspecto 4:3 estándar para cámaras
    if (aspectRatio > 4/3) {
      // Contenedor más ancho que alto
      newHeight = Math.max(containerHeight, minHeight);
      newWidth = Math.round(newHeight * (4/3));
    } else {
      // Contenedor más alto que ancho
      newWidth = Math.max(containerWidth, minWidth);
      newHeight = Math.round(newWidth * (3/4));
    }
    
    console.log('Nuevas dimensiones calculadas:', newWidth, 'x', newHeight);
    
    // Actualizar dimensiones solo si han cambiado significativamente
    if (Math.abs(this.webcamWidth - newWidth) > 10 || 
        Math.abs(this.webcamHeight - newHeight) > 10) {
      
      this.webcamWidth = newWidth;
      this.webcamHeight = newHeight;
      
      // Actualizar canvas con las mismas dimensiones
      if (this.handCanvas?.nativeElement) {
        const canvas = this.handCanvas.nativeElement;
        canvas.width = newWidth;
        canvas.height = newHeight;
        
        // Limpiar canvas
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
      
      // Reposicionar el WebcamComponent para que esté centrado
      setTimeout(() => {
        if (this.webcam?.video?.nativeElement) {
          const videoElement = this.webcam.video.nativeElement;
          // Forzar las mismas dimensiones que el canvas
          videoElement.width = newWidth;
          videoElement.height = newHeight;
        }
      }, 100);
    }
  };

  private setupWebcamDimensions() {
    // Establecer valores predeterminados razonables
    this.webcamWidth = 640;
    this.webcamHeight = 480;
    
    // Actualizar dimensiones basadas en el contenedor
    this.updateWebcamDimensions();
    
    // Agregar listener para actualizaciones de tamaño
    window.addEventListener('resize', () => {
      this.updateWebcamDimensions();
    });
  }

  
  

  

  // Añadir este nuevo método para reinicializar la aplicación
  resetApplication() {
    // Reiniciar variables principales
    this.currentStep = 1;
    this.selectedImage = null;
    this.selectedBackground = null;
    this.imagePreview = null;
    this.backgroundPreview = 'assets/imgs/bosque.jpg';
    this.showPreview = false;
    this.isMerging = false;
    this.showPolicyModal = false;
    this.isInitializing = false;
    
    // Reiniciar imágenes resultado
    this.resultImage1 = null;
    this.resultImage2 = null;
    this.currentUploadedUrl = null;
    
    // Reiniciar estado de webcam
    this.showWebcam = true;
    this.isHandDetected = false;
    this.showCountdown = false;

    // Reiniciar formulario si es necesario
    if (!this.wantsEmail) {
      this.emailForm.get('email')?.disable();
    } else {
      this.emailForm.get('email')?.enable();
    }

    // Cancelar cualquier suscripción pendiente
    this.webcamCheckSubscription?.unsubscribe();
    
    // Reiniciar selectedStyle
    this.selectedStyle = null;
    
    console.log('Aplicación reinicializada');
  }

  // Método para abrir modal de QR con una imagen específica
  shareWithQR(imageUrl: string, styleName: string) {
    this.isGeneratingQR = true;
    this.currentQRTitle = `Estilo ${styleName}`;
    
    this.imageSharingService.uploadImageWithQR(imageUrl).subscribe(
      result => {
        this.currentUploadedUrl = result.imageUrl; // Guardar la URL
        //this.showQRModal = true;
        this.isGeneratingQR = false;
      },
      error => {
        console.error('Error al generar QR:', error);
        this.isGeneratingQR = false;
        alert('No se pudo subir la imagen. Inténtalo de nuevo.');
      }
    );
  }

  // Método para compartir ambas imágenes cuando ya se han generado
  shareAllWithQR() {
    if (!this.resultImage1 || !this.resultImage2) {
      alert('Ambas imágenes deben estar generadas para compartirlas.');
      return;
    }
    
    this.isGeneratingQR = true;
    this.currentQRTitle = 'Ambos estilos';
    
    this.imageSharingService.uploadBothStyles(this.resultImage1, this.resultImage2).subscribe(
      results => {
        console.log('Resultados de subir ambas imágenes:', results);
        
        this.currentUploadedUrl = results.shinkai.imageUrl;
        //this.showQRModal = true;
        this.isGeneratingQR = false;
      },
      error => {
        console.error('Error al generar QRs:', error);
        this.isGeneratingQR = false;
        alert('No se pudo generar los códigos QR. Inténtalo de nuevo.');
      }
    );
  }

  // Método para cerrar el modal de QR
  closeQRModal() {
    this.showQRModal = false;
    this.qrImageUrl = null;
  }

  // Método para seleccionar estilo
  selectStyle(style: 'shinkai' | 'hayao') {
    this.selectedStyle = style;
    console.log(`Estilo seleccionado: ${this.styleNames[style]}`);
    this.goToNextStep(); // Esto avanza al paso 2
  }
} 