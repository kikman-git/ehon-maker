package app.ehon.catalog

import app.ehon.model.PartId

/** A local lookup; platforms populate it from library and installed-pack metadata. */
fun interface PartResolver {
    fun find(id: PartId): Part?
}
