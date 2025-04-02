import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { OnnxService } from './services/onnx.service';
interface DocumentWithFullscreen extends Document {
  mozCancelFullScreen?: () => Promise<void>;
  webkitExitFullscreen?: () => Promise<void>;
  msExitFullscreen?: () => Promise<void>;
}

// Añadir estas interfaces para los métodos específicos de navegador
interface HTMLElementWithFullscreen extends HTMLElement {
  mozRequestFullScreen?: () => Promise<void>;
  webkitRequestFullscreen?: () => Promise<void>;
  msRequestFullscreen?: () => Promise<void>;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit{

  isModelLoading1: boolean = true;
  isModelLoading2: boolean = true;
  isModelLoaded: boolean = false;
  constructor(
    private onnxService: OnnxService,
    private router: Router) {
      // Cargar ambos modelos ONNX en paralelo
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
  ngOnInit(): void {
    // Mostrar modal personalizado en lugar de confirm
    setTimeout(() => {
      this.showFullscreenModal = true;
    }, 1000);
  }

  title = 'image-mixer';

  isComposerRoute(): boolean {
    return this.router.url === '/image-composer';
  }

  // Añadir esta propiedad
  isFullscreen: boolean = false;
  // Añade esta nueva propiedad
  showFullscreenModal: boolean = false;

  // Método corregido para entrar en pantalla completa
  requestFullscreen() {
    const docElm = document.documentElement as HTMLElementWithFullscreen;
    
    if (docElm.requestFullscreen) {
      docElm.requestFullscreen();
    } else if (docElm.mozRequestFullScreen) { /* Firefox */
      docElm.mozRequestFullScreen();
    } else if (docElm.webkitRequestFullscreen) { /* Chrome, Safari y Opera */
      docElm.webkitRequestFullscreen();
    } else if (docElm.msRequestFullscreen) { /* IE/Edge */
      docElm.msRequestFullscreen();
    }
    
    this.isFullscreen = true;
  }

  
  
  // Método corregido para salir de pantalla completa
  exitFullscreen() {


    const doc = document as DocumentWithFullscreen;
    
    if (doc.exitFullscreen) {
      doc.exitFullscreen();
    } else if (doc.mozCancelFullScreen) { /* Firefox */
      doc.mozCancelFullScreen();
    } else if (doc.webkitExitFullscreen) { /* Chrome, Safari y Opera */
      doc.webkitExitFullscreen();
    } else if (doc.msExitFullscreen) { /* IE/Edge */
      doc.msExitFullscreen();
    }
    
    this.isFullscreen = false;
  }

  // Escucha los cambios de estado de pantalla completa
  @HostListener('document:fullscreenchange', ['$event'])
  @HostListener('document:webkitfullscreenchange', ['$event'])
  @HostListener('document:mozfullscreenchange', ['$event'])
  @HostListener('document:MSFullscreenChange', ['$event'])
  onFullscreenChange() {
    this.isFullscreen = !!document.fullscreenElement;
  }

  // Añadir este nuevo método
  closeFullscreenModal(enterFullscreen: boolean) {
    this.showFullscreenModal = false;
    
    if (enterFullscreen) {
      // Retrasar ligeramente para asegurar que el evento de clic se complete
      setTimeout(() => {
        this.requestFullscreen();
      }, 50);
    }
  }
}
