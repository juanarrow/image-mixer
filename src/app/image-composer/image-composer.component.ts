import { Component, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { WebcamImage, WebcamInitError, WebcamUtil } from 'ngx-webcam';
import { Subject, Observable, of } from 'rxjs';

@Component({
  selector: 'app-image-composer',
  templateUrl: './image-composer.component.html',
  styles: []
})
export class ImageComposerComponent implements OnDestroy {
  currentStep = 1;
  emailForm: FormGroup;
  selectedImage: File | null = null;
  selectedBackground: File | null = null;
  imagePreview: string | null = null;
  backgroundPreview: string | null = null;
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

  videoOptions: MediaTrackConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 }
  };

  backgrounds = [
    { id: 1, url: 'assets/imgs/bosque.jpg', name: 'Bosque' },
    { id: 2, url: 'assets/imgs/ciudad.jpg', name: 'Ciudad' },
    { id: 3, url: 'assets/imgs/playa.jpeg', name: 'Playa' }
  ];

  constructor(private fb: FormBuilder) {
    this.emailForm = this.fb.group({
      email: [{ value: '', disabled: true }, [Validators.required, Validators.email]]
    });
  }

  public get triggerObservable(): Observable<void> {
    return this.trigger.asObservable();
  }

  public handleImage(webcamImage: WebcamImage): void {
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
      this.currentStep = 4;
      setTimeout(() => {
        this.isMerging = true;
        setTimeout(() => {
          this.processImages();
        }, 1500);
      }, 500);
    };
    
    img.src = webcamImage.imageAsDataUrl;
  }

  public triggerSnapshot(): void {
    this.trigger.next();
  }

  public handleInitError(error: WebcamInitError): void {
    console.error('Error al inicializar la cámara:', error);
    this.errors.push(error);
  }

  public handleInitSuccess(): void {
    console.log('Cámara inicializada');
    this.isCameraReady = true;
  }

  onEmailSubmit() {
    if (!this.wantsEmail || (this.wantsEmail && this.emailForm.valid)) {
      this.currentStep = 2;
    }
  }

  selectBackground(backgroundUrl: string) {
    this.backgroundPreview = backgroundUrl;
    this.currentStep = 3;
  }

  processImages() {
    console.log('Procesando imágenes...');
    // Aquí iría la lógica para combinar las imágenes y enviar por email
  }

  ngOnInit() {
    WebcamUtil.getAvailableVideoInputs()
      .then((mediaDevices: MediaDeviceInfo[]) => {
        this.isCameraReady = true;
        console.log('Cámaras disponibles:', mediaDevices);
      });
  }

  ngOnDestroy(): void {
    this.trigger.complete();
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
} 