import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, from, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class ImageSharingService {
  private readonly IMGBB_API_KEY = '436006bc09bdf83c99bf1f409bb08202'; // Reemplazar con tu API key de imgbb.com
  public readonly QR_API_URL = 'https://api.qrserver.com/v1/create-qr-code/';

  constructor(private http: HttpClient) {}

  /**
   * Sube una imagen a ImgBB y devuelve la URL junto con el QR
   */
  uploadImageWithQR(imageData: string): Observable<{imageUrl: string, displayUrl: string, qrUrl: string}> {
    // Eliminar el prefijo de data URL si existe
    const base64Image = imageData.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
    
    // Preparar datos para ImgBB
    const formData = new FormData();
    formData.append('key', this.IMGBB_API_KEY);
    formData.append('image', base64Image);
    formData.append('expiration', '5'); // 1 hora (en minutos)
    
    return this.http.post('https://api.imgbb.com/1/upload', formData).pipe(
      map((response: any) => {
        console.log('Respuesta de ImgBB:', response);
        
        // Obtener las URLs correctas de la respuesta
        const imageUrl = response.data.url; // URL directa a la imagen
        const displayUrl = response.data.url_viewer; // URL a la página de visualización
        
        // Generar QR usando la URL directa a la imagen
        const qrUrl = `${this.QR_API_URL}?data=${encodeURIComponent(imageUrl)}&size=200x200`;
        
        return {
          imageUrl: imageUrl,
          displayUrl: displayUrl,
          qrUrl: qrUrl
        };
      }),
      catchError(error => {
        console.error('Error subiendo imagen a ImgBB:', error);
        // En caso de error, usar la imagen original
        const qrUrl = `${this.QR_API_URL}?data=${encodeURIComponent(imageData)}&size=200x200`;
        return of({
          imageUrl: imageData,
          displayUrl: imageData,
          qrUrl: qrUrl
        });
      })
    );
  }

  /**
   * Sube ambas imágenes de estilo al mismo tiempo y devuelve sus QR codes
   */
  uploadBothStyles(image1: string, image2: string): Observable<{
    shinkai: {imageUrl: string, displayUrl: string, qrUrl: string}, 
    hayao: {imageUrl: string, displayUrl: string, qrUrl: string}
  }> {
    return forkJoin({
      shinkai: this.uploadImageWithQR(image1),
      hayao: this.uploadImageWithQR(image2)
    });
  }
} 