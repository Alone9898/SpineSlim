#if UNITY_EDITOR
using System;
using System.IO;
using UnityEditor;
using UnityEngine;

namespace SpineSlim.EditorTools
{
    public static class SpineSlimAtlasImporter
    {
        [Serializable] private class AtlasData { public int version; public float pixelsPerUnit; public AtlasPage[] pages; }
        [Serializable] private class AtlasPage { public string image; public int width; public int height; public SpriteData[] sprites; }
        [Serializable] private class SpriteData { public string name; public int x; public int y; public int width; public int height; }

        [MenuItem("Tools/SpineSlim/Import Atlas")]
        public static void ImportAtlas()
        {
            string selected = EditorUtility.OpenFilePanel("SpineSlim atlas manifest", Application.dataPath, "json");
            if (string.IsNullOrEmpty(selected)) return;
            try
            {
                string fullPath = Path.GetFullPath(selected).Replace('\\', '/');
                string assets = Path.GetFullPath(Application.dataPath).Replace('\\', '/') + "/";
                if (!fullPath.StartsWith(assets, StringComparison.Ordinal)) throw new InvalidOperationException("Put the manifest and PNGs inside Assets first.");
                AtlasData data = JsonUtility.FromJson<AtlasData>(File.ReadAllText(fullPath));
                if (data == null || data.version != 1 || data.pages == null || data.pages.Length == 0 || data.pixelsPerUnit <= 0)
                    throw new InvalidOperationException("Invalid SpineSlim manifest.");
                string folder = Path.GetDirectoryName(fullPath);
                foreach (AtlasPage page in data.pages)
                {
                    if (string.IsNullOrEmpty(page.image) || page.image != Path.GetFileName(page.image) || !page.image.EndsWith(".png", StringComparison.OrdinalIgnoreCase) || page.sprites == null)
                        throw new InvalidOperationException("Invalid atlas page.");
                    if (!File.Exists(Path.Combine(folder, page.image))) throw new FileNotFoundException(page.image);
                    foreach (SpriteData sprite in page.sprites)
                        if (string.IsNullOrEmpty(sprite.name) || sprite.x < 0 || sprite.y < 0 || sprite.width <= 0 || sprite.height <= 0 || (long)sprite.x + sprite.width > page.width || (long)sprite.y + sprite.height > page.height)
                            throw new InvalidOperationException("Invalid sprite rectangle.");
                }
                AssetDatabase.Refresh();
                foreach (AtlasPage page in data.pages)
                {
                    string assetPath = "Assets/" + Path.Combine(folder, page.image).Replace('\\', '/').Substring(assets.Length);
                    TextureImporter importer = AssetImporter.GetAtPath(assetPath) as TextureImporter;
                    if (importer == null) throw new InvalidOperationException("Cannot import " + assetPath);
                    importer.textureType = TextureImporterType.Sprite;
                    importer.spriteImportMode = SpriteImportMode.Multiple;
                    importer.spritePixelsPerUnit = data.pixelsPerUnit;
                    importer.alphaIsTransparency = true;
                    importer.mipmapEnabled = false;
                    importer.npotScale = TextureImporterNPOTScale.None;
                    importer.maxTextureSize = 8192;
                    importer.textureCompression = TextureImporterCompression.Uncompressed;
                    TextureImporterSettings textureSettings = new TextureImporterSettings();
                    importer.ReadTextureSettings(textureSettings);
                    textureSettings.spriteMeshType = SpriteMeshType.FullRect;
                    importer.SetTextureSettings(textureSettings);
                    SpriteMetaData[] sprites = new SpriteMetaData[page.sprites.Length];
                    for (int index = 0; index < sprites.Length; index++)
                    {
                        SpriteData source = page.sprites[index];
                        sprites[index] = new SpriteMetaData { name = source.name, rect = new Rect(source.x, source.y, source.width, source.height), alignment = (int)SpriteAlignment.Center, pivot = new Vector2(0.5f, 0.5f) };
                    }
#pragma warning disable 0618
                    importer.spritesheet = sprites;
#pragma warning restore 0618
                    importer.SaveAndReimport();
                }
                Debug.Log("SpineSlim: imported " + data.pages.Length + " atlas page(s).");
            }
            catch (Exception error) { EditorUtility.DisplayDialog("SpineSlim", error.Message, "OK"); }
        }
    }
}
#endif
