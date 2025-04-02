import { Component, OnDestroy, ElementRef, ViewChild, AfterViewInit, OnInit, AfterViewChecked, HostListener, ChangeDetectorRef } from '@angular/core';
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
export class ImageComposerComponent implements OnDestroy, AfterViewInit, AfterViewChecked, OnInit {
  @ViewChild('handVideo') handVideo!: ElementRef<HTMLVideoElement>;
  @ViewChild('webcam') webcam: any;  // Solo necesitamos esta referencia
  @ViewChild('handCanvas') handCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('imagesContainer') imagesContainer!: ElementRef<HTMLElement>;
  @ViewChild('webcamContainer') webcamContainer!: ElementRef<HTMLDivElement>;
  
  currentStep = 1;
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
  private trigger = new Subject<void>();
  private _triggerObservable: Observable<void>;
  showWebcam = true;
  errors: WebcamInitError[] = [];
  public switchCamera: Observable<boolean> = of(true);

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

  // Agregar propiedades para dimensiones dinámicas
  webcamContainerWidth: number = 0;
  webcamContainerHeight: number = 0;

  // Añadir variables para seguimiento de cambios de tamaño
  private lastContainerWidth = 0;
  private lastContainerHeight = 0;

  // Agregar estas propiedades al componente
  isUsingRearCamera: boolean = false;

  constructor(
    private onnxService: OnnxService,
    private imageSharingService: ImageSharingService,
    private cdr: ChangeDetectorRef
  ) {
    this._triggerObservable = this.trigger.asObservable();
    // Cargar modelos TensorFlow
    setupBackends().then(() => {
      console.log('TensorFlow está listo');
    }).catch(err => {
      console.error('Error al configurar TensorFlow:', err);
    });
    
    // Cargar ambos modelos ONNX en paralelo
    this.isModelLoading1 = true;
    this.isModelLoading2 = true;
    
    // Cargar modelos en paralelo
    Promise.all([
      this.onnxService.loadModel('assets/onnx/Shinkai_37.onnx').then(() => {
        this.isModelLoading1 = false;
        console.log('Modelo Shinkai cargado correctamente');
      }),
      this.onnxService.loadModel2('assets/onnx/Hayao_36.onnx').then(() => {
        this.isModelLoading2 = false;
        console.log('Modelo Hayao cargado correctamente');
      })
    ]).then(() => {
      this.isModelLoaded = true;
    }).catch((error) => {
      console.error('Error al cargar modelos ONNX:', error);
      this.isModelLoading1 = false;
      this.isModelLoading2 = false;
    });
    
  }

  public get triggerObservable(): Observable<void> {
    return this._triggerObservable;
  }

  public handleImage(webcamImage: WebcamImage): void {
    console.log('Imagen capturada:', webcamImage);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = (() => {
      canvas.width = img.width;
      canvas.height = img.height;
      if(!this.isUsingRearCamera){
        ctx!.scale(-1, 1);
        ctx!.translate(-img.width, 0);
      }
      else{
        ctx!.scale(1, 1);
        ctx!.translate(0, 0);
      }
      ctx!.drawImage(img, 0, 0);
      this.imagePreview = canvas.toDataURL('image/jpeg');
      this.showWebcam = false;
      this.showPreview = true;
      this.goToNextStep(); 
    }).bind(this);
    
    img.src = webcamImage.imageAsDataUrl;
  }

  public triggerSnapshot(): void {
    setTimeout(() => {
      this.trigger.next();
    }, 0);
  }

  public handleInitError(error: WebcamInitError): void {
    console.error('Error al inicializar la webcam:', error);
    this.errors.push(error);
  }

  public handleInitSuccess(): void {
    console.log('Webcam inicializada con éxito');
    this.isCameraReady = true;
  }

  
  ngOnDestroy() {
    // Cancelar suscripciones
    this.webcamCheckSubscription?.unsubscribe();
    this.trigger.complete();
    
    // Liberar recursos de video
    if (this.webcam?.video?.nativeElement?.srcObject) {
      const stream = this.webcam.video.nativeElement.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
  }

  async ngAfterViewInit() {
    // Inicializar la webcam y manejar la detección de cambios
    this.initWebcam();
    
    // Manejar detección de cambios apropiadamente
    setTimeout(() => {
      this.updateWebcamContainerSize();
      this.cdr.detectChanges();
    }, 100);
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
      alert('Hubo un problema, todos nos equivocamos, intentalo de nuevo');
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

  onCountdownFinished() {
    console.log('Cuenta atrás finalizada, tomando foto...');
    this.showCountdown = false;
    setTimeout(() => {
      this.triggerSnapshot();
      this.cdr.detectChanges();
    }, 0);
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
      this.initWebcam();
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

  // Método de inicialización de webcam corregido
  initWebcam() {
    console.log('Inicializando webcam...');
    this.showWebcam = true;
    this.isCameraReady = false;
    
    // Actualizar las dimensiones iniciales del contenedor
    setTimeout(() => {
      this.updateWebcamContainerSize();
      this.cdr.detectChanges();
    }, 0);
    
    // Verificar periódicamente si la webcam está lista
    this.webcamCheckSubscription = interval(500)
      .pipe(take(20)) // Intentar por 10 segundos (20 * 500ms)
      .subscribe(() => {
        if (this.webcam && this.webcam.video && this.webcam.video.nativeElement) {
          this.isCameraReady = true;
          this.webcamCheckSubscription?.unsubscribe();
          console.log('Webcam inicializada correctamente');
          
          // Una vez que la cámara está lista, actualizar de nuevo el tamaño
          this.updateWebcamContainerSize();
        }
      });
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
    
    // Cancelar cualquier suscripción pendiente
    this.webcamCheckSubscription?.unsubscribe();
    
    // Reiniciar selectedStyle
    this.selectedStyle = null;
    
    console.log('Aplicación reinicializada');
  }

  // Método para actualizar dimensiones dinámicamente
  updateWebcamContainerSize() {
    if (!this.webcamContainer?.nativeElement) {
      console.log('El contenedor de webcam no está disponible');
      return;
    }
    
    // Usar setTimeout para asegurar que los cambios ocurren en el siguiente ciclo
    setTimeout(() => {
      const container = this.webcamContainer.nativeElement;
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      
      console.log(`Actualizando dimensiones: ${containerWidth}x${containerHeight}`);
      
      this.webcamWidth = containerWidth;
      this.webcamHeight = containerHeight;
      
      this.webcamContainerWidth = containerWidth;
      this.webcamContainerHeight = containerHeight;
      
      // Forzar detección de cambios
      this.cdr.detectChanges();
    }, 0);
  }

  // Implementar ngAfterViewChecked para detectar cambios en el DOM
  ngAfterViewChecked() {
    // Verificar si el contenedor existe y si sus dimensiones han cambiado
    if (this.webcamContainer?.nativeElement) {
      const currentWidth = this.webcamContainer.nativeElement.clientWidth;
      const currentHeight = this.webcamContainer.nativeElement.clientHeight;
      
      // Solo actualizar si hay cambios significativos en las dimensiones
      if (Math.abs(currentWidth - this.lastContainerWidth) > 5 || 
          Math.abs(currentHeight - this.lastContainerHeight) > 5) {
        this.lastContainerWidth = currentWidth;
        this.lastContainerHeight = currentHeight;
        
        // Usar setTimeout para aplazar la actualización
        setTimeout(() => {
          this.updateWebcamContainerSize();
        }, 0);
      }
    }
  }

  // Escuchar cambios de tamaño de ventana
  @HostListener('window:resize', ['$event'])
  onResize(event: Event) {
    this.updateWebcamContainerSize();
  }

  // Método para iniciar la cuenta atrás en lugar de disparar la captura directamente
  startCountdown(): void {
    if(!this.isMobileDevice()){
      console.log('Iniciando cuenta atrás para captura...');
      this.showCountdown = true;
    }
    else{
      this.triggerSnapshot();
    }
  }

  // Método para detectar si estamos en un dispositivo móvil
  isMobileDevice(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  // Inicializar la configuración de la cámara al inicio
  ngOnInit() {
    
    // Detectar si estamos en un dispositivo móvil para configurar la cámara
    if (this.isMobileDevice()) {
      // En móviles configuramos la cámara trasera por defecto
      this.videoOptions = {
        
        width: { ideal: 1280 },
        height: { ideal: 720 },
        
        facingMode: 'environment' // Preferencia por cámara trasera
      };
      this.isUsingRearCamera = true;
      this.allowCameraSwitch = false; // Opcional: desactivar cambio de cámara en móviles
    } else {
      // En escritorio mantenemos la cámara frontal
      this.videoOptions = {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user'
      };
      this.isUsingRearCamera = false;
    }
    console.log(`Configuración inicial de cámara: ${this.isUsingRearCamera ? 'trasera' : 'frontal'}`);
  }

  // Si implementamos cambio de cámara, debemos actualizar isUsingRearCamera
  onCameraSwitch(facingMode: string) {
    console.log(`Cambiando a cámara ${facingMode}`);
    //this.isUsingRearCamera = facingMode === 'environment';
  }

  // Método para abrir la imagen en una nueva pestaña
  openImageInNewTab(imageUrl: string | null): void {
    if (!imageUrl) return;
    
    // Verificar si la imagen es un data URL
    if (imageUrl.startsWith('data:image')) {
      // Para Data URLs, necesitamos crear un HTML básico
      const newWindow = window.open('', '_blank');
      if (newWindow) {
        newWindow.document.write(`
          <html>
            <head>
              <title>Imagen Estilo ${this.selectedStyle ? this.styleNames[this.selectedStyle] : ''}</title>
              <style>
                body {
                  margin: 0;
                  padding: 0;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  background-color: #1e293b;
                  min-height: 100vh;
                }
                img {
                  width:100%;
                  max-width: 100%;
                  max-height: 100vh;
                  object-fit: contain;
                  border-radius: 8px;
                  box-shadow: 0 0 20px rgba(0,0,0,0.3);
                }
              </style>
            </head>
            <body>
              <img src="${imageUrl}" alt="Imagen procesada">
            </body>
          </html>
        `);
        newWindow.document.close();
      }
    } else {
      // Si no es un Data URL, usar el método normal
      window.open(imageUrl, '_blank');
    }
  }
} 