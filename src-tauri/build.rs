fn main() {
    println!(
        "cargo:rustc-env=SPINESLIM_TARGET={}",
        std::env::var("TARGET").unwrap()
    );
    tauri_build::build()
}
