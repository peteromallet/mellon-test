import { Canvas } from '@react-three/fiber';
import { Environment, OrbitControls, useGLTF, Center } from '@react-three/drei';
import config from '../../../config';
import { useEffect, useState } from 'react';
import { useStore } from '@xyflow/react';

import Button from '@mui/material/Button';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';

import * as THREE from 'three';

function getMaterial(materialType: string, wireframe: boolean, shaded: boolean, originalMaterial: THREE.Material | null) {
    let material;
    switch(materialType) {
        case 'phong':
            material = new THREE.MeshPhongMaterial({
            color: 0xffffff,
            wireframe,
            flatShading: !shaded,
            shininess: 100,
            specular: 0x444444,
            side: THREE.DoubleSide
        });
        break;
    case 'lambert':
        material = new THREE.MeshLambertMaterial({
            color: 0xffffff,
            wireframe,
            flatShading: !shaded,
            side: THREE.DoubleSide
        });
        break;
    case 'normal':
        material = new THREE.MeshNormalMaterial({
            wireframe,
            flatShading: !shaded,
            side: THREE.DoubleSide
        });
        break;
    case 'toon':
        material = new THREE.MeshToonMaterial({
            color: 0xffffff,
            wireframe,
            side: THREE.DoubleSide,
            map: originalMaterial instanceof THREE.MeshStandardMaterial ? originalMaterial.map : null,
            normalMap: originalMaterial instanceof THREE.MeshStandardMaterial ? originalMaterial.normalMap : null,
        });
        break;
    case 'metal':
        material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            metalness: 1.0,
            roughness: 0.1,
            wireframe,
            flatShading: !shaded,
            side: THREE.DoubleSide,
            envMapIntensity: 1.5
        });
        break;
    default: // 'standard'
        material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            wireframe,
            flatShading: !shaded,
            roughness: 0.5,
            metalness: 0.1,
            side: THREE.DoubleSide
        });
    }

    return material;
}

function Model({ url, wireframe, shaded, materialType }: { url: string, wireframe: boolean, shaded: boolean, materialType: string }) {
    const [error, setError] = useState<Error | null>(null);
    const { scene } = useGLTF(url, undefined, undefined, (err: any) => {
        if (err instanceof Error) {
            console.log("Error loading 3d model", err.message)
            setError(err);
        }
    });

    if (error || !scene) {
        return null;
    }

    useEffect(() => {
        console.log("scene", scene)
        scene.traverse((child: any) => {
            if (child.isMesh) {
                console.log("mesh", child)
                child.userData.originalMaterial = child.material;
                console.log("child material", child.material)
            }
        });
    }, [scene]);

    useEffect(() => {
        scene.traverse((child: any) => {
            if (child.isMesh) {
                if (child.material) {
                    if (materialType === 'original') {
                        child.material = child.userData.originalMaterial;
                        child.material.flatShading = !shaded;
                        child.material.wireframe = wireframe;
                        //child.material.emissive = new THREE.Color(0x111111);
                        //child.material.emissiveIntensity = 1.5;
                    } else {
                        child.material = getMaterial(materialType, wireframe, shaded, child.userData.originalMaterial);
                    }
                    child.material.needsUpdate = true;
                    
                    // Force geometry normal updates
                    if (child.geometry) {
                        child.geometry.computeVertexNormals();
                        child.geometry.attributes.normal.needsUpdate = true;
                    }
                }
            }
        });
    }, [wireframe, shaded, materialType]);

    return (
        <Center>
            <primitive object={scene} />
        </Center>
    );
}

export default function ThreePreview({ value, ...props }: { value: any, [key: string]: any }) {
    const zoomLevel = useStore((state: any) => state.transform[2]);
    const [wireframe, setWireframe] = useState(false);
    const [shaded, setShaded] = useState(false);
    const [materialType, setMaterialType] = useState('original');

    const containerSize = 768;
    const scaledSize = containerSize * zoomLevel;

    const url = value[0]?.url;
    return (
        <div
            style={{
                position: 'relative',
                width: '768px',
                height: '768px',
                overflow: 'hidden',
            }}
            {...props}
        >
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                transform: `scale(${1/zoomLevel})`,
                transformOrigin: 'top left',
                width: `${scaledSize}px`,
                height: `${scaledSize}px`,
            }}>
                <Canvas
                    style={{ background: '#333333', width: '100%', height: '100%' }}
                    resize={{ scroll: false, debounce: { scroll: 50, resize: 0 } }}
                    camera={{ position: [0, 0, 5] }}
                    dpr={2}
                >
                    <ambientLight intensity={0.25} />
                    <directionalLight position={[5, 5, 5]} intensity={1} />
                    <directionalLight position={[-5, 0, -5]} intensity={0.25} />
                    {url && <Model
                        url={`http://${config.serverAddress}${url}`}
                        wireframe={wireframe}
                        shaded={shaded}
                        materialType={materialType}
                    />}
                    <OrbitControls
                        enableDamping
                        target={[0, 0, 0]}
                        dampingFactor={0.05}
                    />
                    <Environment preset="warehouse" background={false} />
                </Canvas>
            </div>

            <Stack 
                direction="row" 
                spacing={1} 
                sx={{ 
                    position: 'absolute', 
                    top: 10, 
                    left: 10, 
                    zIndex: 1 
                }}
            >
                <Button 
                    variant={wireframe ? "contained" : "outlined"}
                    color="secondary"
                    size="small"
                    onClick={() => setWireframe(!wireframe)}
                    sx={{
                        fontSize: '11px',
                        '&.MuiButton-outlined': {
                            color: '#999999',
                        }
                    }}
                >
                    Wireframe
                </Button>
                <Button 
                    variant={shaded ? "contained" : "outlined"}
                    color="secondary"
                    size="small"
                    onClick={() => setShaded(!shaded)}
                    sx={{
                        fontSize: '11px',
                        '&.MuiButton-outlined': {
                            color: '#999999',
                        }
                    }}
                >
                    Smooth shading
                </Button>
                <Select
                    value={materialType}
                    onChange={(e) => setMaterialType(e.target.value)}
                    size="small"
                    native={true}
                    sx={{
                        fontSize: '12px',
                        width: '120px',
                        backgroundColor: 'rgba(0, 0, 0, 0.2)',
                    }}
                >
                    <option value="original">Original</option>
                    <option value="standard">Standard</option>
                    <option value="phong">Phong</option>
                    <option value="lambert">Lambert</option>
                    <option value="normal">Normal</option>
                    <option value="toon">Toon</option>
                    <option value="metal">Metal</option>
                </Select>
            </Stack>
        </div>
    );
}